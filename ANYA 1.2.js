import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, getDocs } from 'firebase/firestore';

// Main A.N.Y.A. component
const ANYA = () => {
    // Firebase state
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [firebaseStatus, setFirebaseStatus] = useState('Initializing Firebase...');

    // Chat states
    const [chatHistory, setChatHistory] = useState([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [notification, setNotification] = useState({ message: '', type: '' });
    const [isListening, setIsListening] = useState(false); // For main voice input
    const [connectionStatus, setConnectionStatus] = useState('offline');
    const [isSpeaking, setIsSpeaking] = useState(false); // For Text-to-Speech status
    const [systemLogs, setSystemLogs] = useState([]); // To store system logs for debug mode
    const [userInterests, setUserInterests] = useState([]); // New state for user interests

    // Creator Recognition & Hidden Function States
    const [isCalvinRecognized, setIsCalvinRecognized] = useState(false);
    const [awaitingPassword, setAwaitingPassword] = useState(false);
    const [hiddenFunctionUnlocked, setHiddenFunctionUnlocked] = useState(false);
    const [awaitingVoiceCommand, setAwaitingVoiceCommand] = useState(false); // New state for voice command mode

    // Refs for UI elements
    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null); // For main speech recognition
    const abortControllerRef = useRef(null); // For API call cancellation
    const speechSynthRef = useRef(window.speechSynthesis);
    const selectedVoiceRef = useRef(null); // To store the selected TTS voice

    // No API Key needed for Open-Meteo's basic forecast API

    // --- Utility Functions (defined at the top level of the component) ---

    // Notification system with auto-dismiss
    const showNotification = useCallback((message, type = 'info', duration = 4000) => {
        setNotification({ message, type });
        setTimeout(() => {
            setNotification({ message: '', type: '' });
        }, duration);
    }, []);

    // Function to add a log entry
    const addLog = useCallback((message, type = 'info') => {
        setSystemLogs(prevLogs => {
            const newLog = { timestamp: new Date(), message, type };
            // Keep only the last 50 logs to prevent memory issues
            return [...prevLogs, newLog].slice(-50);
        });
    }, []);

    // Auto-scroll to bottom
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    // Text-to-Speech function
    const speak = useCallback((text) => {
        if (!speechSynthRef.current) {
            addLog('SpeechSynthesis not available.', 'error');
            showNotification('Speech output not available in your browser.', 'error'); // Added notification
            return;
        }

        let voiceToUse = selectedVoiceRef.current;
        const availableVoices = speechSynthRef.current.getVoices();

        // If no voice is currently selected OR the selected voice is no longer available in the browser's list
        if (!voiceToUse || !availableVoices.some(v => v.name === voiceToUse.name && v.lang === voiceToUse.lang)) {
            addLog('Re-evaluating available voices for speech synthesis.', 'info');
            let foundVoice = availableVoices.find(
                voice => voice.lang === 'en-GB' && voice.name.includes('Female')
            );
            if (!foundVoice) {
                foundVoice = availableVoices.find(voice => voice.lang === 'en-GB');
            }
            if (!foundVoice) {
                foundVoice = availableVoices.find(voice => voice.lang.startsWith('en') && voice.name.includes('Female'));
            }
            if (!foundVoice) {
                foundVoice = availableVoices.find(voice => voice.lang.startsWith('en'));
            }
            if (!foundVoice && availableVoices.length > 0) {
                foundVoice = availableVoices[0];
            }

            if (foundVoice) {
                selectedVoiceRef.current = foundVoice;
                voiceToUse = foundVoice; // Set for current call
                addLog(`(Runtime) Re-selected voice: ${foundVoice.name} (${foundVoice.lang})`, 'info');
            } else {
                addLog('No suitable voice found for speech synthesis. Cannot speak.', 'warning');
                showNotification('No voice available for speech output. Check browser settings.', 'warning');
                return; // Crucial: exit if no voice can be found
            }
        }

        // Stop any ongoing speech
        if (speechSynthRef.current.speaking) {
            speechSynthRef.current.cancel();
            addLog('Cancelled ongoing speech.', 'info');
        }

        addLog(`Attempting to speak "${text.substring(0, Math.min(text.length, 50))}..." with voice: ${voiceToUse?.name || 'N/A'} (${voiceToUse?.lang || 'N/A'}) (Available voices: ${availableVoices.length})`, 'debug');

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voiceToUse;
        utterance.rate = 1;
        utterance.pitch = 1;

        // Crucial check: ensure a voice is actually assigned before speaking
        if (!utterance.voice) {
            addLog('Utterance voice is null or undefined after assignment. Cannot speak.', 'error');
            showNotification('Speech output failed: No voice assigned.', 'error');
            return;
        }

        utterance.onstart = () => {
            setIsSpeaking(true);
            addLog('Speech synthesis started.', 'info');
        };
        utterance.onend = () => {
            setIsSpeaking(false);
            addLog('Speech synthesis ended.', 'info');
        };
        utterance.onerror = (event) => {
            setIsSpeaking(false);
            const errorMessage = event.error || 'Unknown error during synthesis. This might be a browser-specific issue or no voices are available.'; // More descriptive fallback
            addLog(`Speech synthesis error: ${errorMessage} for text: "${text.substring(0, Math.min(text.length, 50))}..."`, 'error'); // Log error with partial text
            console.error('SpeechSynthesisUtterance.onerror event details:', event); // Log full event for debugging
            console.error('Full SpeechSynthesisErrorEvent:', event); // Added for more comprehensive logging
            showNotification(`Speech error: ${errorMessage}. Try refreshing the page or checking browser settings.`, 'error');
        };

        try {
            speechSynthRef.current.speak(utterance);
        } catch (e) {
            addLog(`Error calling speechSynth.speak(): ${e.message} for text: "${text.substring(0, Math.min(text.length, 50))}..."`, 'error'); // Log error with partial text
            console.error('Error calling speechSynth.speak():', e);
            showNotification(`Failed to initiate speech: ${e.message}`, 'error');
        }
    }, [addLog, showNotification]);

    /**
     * Fetches a real-time weather report for a given location using Open-Meteo API.
     * @param {string} location - The location for which to get the weather.
     * @returns {Promise<string>} A promise that resolves to a weather report string.
     */
    const getWeatherReport = useCallback(async (location) => {
        if (connectionStatus === 'offline') {
            return "I'm sorry, I can't fetch real-time weather data while I'm offline. Please check your internet connection.";
        }

        showNotification(`🌤️ Getting live weather for ${location}...`, 'info');
        addLog(`Weather request for: ${location} using Open-Meteo API.`, 'info');

        try {
            // Step 1: Geocoding - Get latitude and longitude for the location
            const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
            const geoResponse = await fetch(geocodingUrl);
            const geoData = await geoResponse.json();

            if (!geoResponse.ok || !geoData.results || geoData.results.length === 0) {
                addLog(`Geocoding failed for "${location}": ${geoData.reason || 'No results found'}`, 'warning');
                return `🤔 I couldn't find a location called "${location}". Please check the spelling or try a more specific name.`;
            }

            const { latitude, longitude, name, country } = geoData.results[0];
            addLog(`Found coordinates for ${name}, ${country}: Lat ${latitude}, Lon ${longitude}`, 'info');

            // Step 2: Fetch weather data using coordinates
            const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,relative_humidity_2m&timezone=auto&forecast_days=1`;
            const weatherResponse = await fetch(weatherApiUrl);
            const weatherData = await weatherResponse.json();

            if (weatherResponse.ok && weatherData.current) {
                const temp = weatherData.current.temperature_2m;
                const humidity = weatherData.current.relative_humidity_2m;
                const windSpeed = weatherData.current.wind_speed_10m; // in km/h

                // Open-Meteo doesn't provide a text description like "sunny" directly,
                // so we'll just report the numerical values.
                addLog(`Weather data retrieved for ${name}, ${country}.`, 'success');
                return `🌡️ The current weather in ${name}, ${country} is ${temp}°C. Humidity is ${humidity}% and wind speed is ${windSpeed} km/h.`;
            } else {
                addLog(`Open-Meteo weather API error for ${name}, ${country}: ${weatherData.reason || weatherResponse.statusText}`, 'error');
                return `I encountered an error while fetching weather data for ${name}, ${country}: ${weatherData.reason || 'Unknown error'}. Please try again later.`;
            }
        } catch (error) {
            addLog(`Network error during weather API call: ${error.message}`, 'error');
            console.error("Network or API error fetching weather:", error);
            return `I'm sorry, I couldn't fetch the weather data due to a network issue. Please check your internet connection.`;
        }
    }, [showNotification, addLog, connectionStatus]);

    /**
     * Performs calculations or unit conversions.
     * @param {string} query - The user's query.
     * @returns {string|null} The result or null if not a calculation/conversion.
     */
    const performCalculationOrConversion = useCallback((query) => {
        const lowerQuery = query.toLowerCase();
        let result = null;

        // Basic arithmetic (e.g., "what is 5 + 3", "calculate 10 * 2")
        const mathMatch = lowerQuery.match(/(?:what is|calculate)\s+([\d\s\+\-\*\/\(\)\.]+)/);
        if (mathMatch && mathMatch[1]) {
            try {
                const expression = mathMatch[1].replace(/x/g, '*').replace(/÷/g, '/');
                // Custom safe evaluation for basic arithmetic
                const evaluateExpression = (expr) => {
                    // This is a simplified parser for demonstration.
                    // For robust production use, consider a dedicated math expression parser library.
                    const operators = ['*', '/', '+', '-', '(', ')'];
                    let parts = [];
                    let currentNum = '';

                    for (let i = 0; i < expr.length; i++) {
                        const char = expr[i];
                        if (operators.includes(char)) {
                            if (currentNum) {
                                parts.push(parseFloat(currentNum));
                                currentNum = '';
                            }
                            parts.push(char);
                        } else if (char === ' ') {
                            if (currentNum) {
                                parts.push(parseFloat(currentNum));
                                currentNum = '';
                            }
                        } else {
                            currentNum += char;
                        }
                    }
                    if (currentNum) {
                        parts.push(parseFloat(currentNum));
                    }
                    
                    // Simple evaluation for now, without full parenthesis support
                    // For production, use a math expression parser
                    let tempResult = parts[0];
                    for (let i = 1; i < parts.length; i += 2) {
                        const op = parts[i];
                        const num = parts[i + 1];
                        if (op === '+') tempResult += num;
                        else if (op === '-') tempResult -= num;
                        else if (op === '*') tempResult *= num;
                        else if (op === '/') {
                            if (num === 0) throw new Error("Division by zero");
                            tempResult /= num;
                        }
                    }
                    return tempResult;
                };

                result = evaluateExpression(expression);
                addLog(`Calculation: "${expression}" = ${result}`, 'info');
                return `The result is: ${result}`;
            } catch (e) {
                addLog(`Calculation error: ${e.message}`, 'error');
                return "I'm sorry, I couldn't perform that calculation.";
            }
        }

        // Unit conversion (e.g., "convert 10 miles to km", "10 kg in pounds")
        const convertMatch = lowerQuery.match(/convert\s+([\d.]+)\s*([a-z]+)\s+to\s+([a-z]+)|([\d.]+)\s*([a-z]+)\s+in\s+([a-z]+)/);
        if (convertMatch) {
            const value = parseFloat(convertMatch[1] || convertMatch[4]);
            const fromUnit = (convertMatch[2] || convertMatch[5])?.toLowerCase();
            const toUnit = (convertMatch[3] || convertMatch[6])?.toLowerCase();

            if (isNaN(value)) return null;

            const conversions = {
                'km': { 'miles': 0.621371, 'm': 1000 },
                'miles': { 'km': 1.60934 },
                'celsius': { 'fahrenheit': (c) => (c * 9/5) + 32 },
                'fahrenheit': { 'celsius': (f) => (f - 32) * 5/9 },
                'kg': { 'pounds': 2.20462 },
                'pounds': { 'kg': 0.453592 },
                'm': { 'feet': 3.28084 },
                'feet': { 'm': 0.3048 }
            };

            if (conversions[fromUnit] && conversions[fromUnit][toUnit]) {
                let convertedValue;
                if (typeof conversions[fromUnit][toUnit] === 'function') {
                    convertedValue = conversions[fromUnit][toUnit](value);
                } else {
                    convertedValue = value * conversions[fromUnit][toUnit];
                }
                addLog(`Conversion: ${value} ${fromUnit} to ${toUnit} = ${convertedValue}`, 'info');
                return `${value} ${fromUnit} is approximately ${convertedValue.toFixed(2)} ${toUnit}.`;
            } else if (conversions[toUnit] && conversions[toUnit][fromUnit]) { // Handle reverse conversion
                 let convertedValue;
                if (typeof conversions[toUnit][fromUnit] === 'function') {
                    convertedValue = conversions[toUnit][fromUnit](value);
                } else {
                    convertedValue = value / conversions[toUnit][fromUnit];
                }
                addLog(`Conversion: ${value} ${fromUnit} to ${toUnit} = ${convertedValue}`, 'info');
                return `${value} ${fromUnit} is approximately ${convertedValue.toFixed(2)} ${toUnit}.`;
            }
        }
        return null;
    }, [addLog]);

    /**
     * States that real-time language translation requires a backend API.
     * @param {string} text - The text to translate.
     * @param {string} targetLang - The target language (e.g., 'es', 'fr').
     * @returns {string} A message indicating the need for a backend service.
     */
    const performTranslation = useCallback(async (text, targetLang) => {
        showNotification(`Translating "${text}" to ${targetLang}...`, 'info');
        addLog(`Translation request: "${text}" to ${targetLang}`, 'info');
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate delay for user experience
        
        const translatedText = `Real-time translation for "${text}" to ${targetLang} requires a backend service with a translation API. I can't perform that directly.`;
        addLog(`Translation limitation message: ${translatedText}`, 'info');
        return translatedText;
    }, [showNotification, addLog]);

    /**
     * States that fetching real-time news headlines requires a backend API.
     * @param {string} topic - The news topic (e.g., 'tech', 'sports', 'world').
     * @returns {Promise<string>} A message indicating the need for a backend service.
     */
    const getNewsHeadlines = useCallback(async (topic) => {
        showNotification(`📰 Fetching news about ${topic || 'general'}...`, 'info');
        addLog(`News request for topic: ${topic || 'general'}`, 'info');
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate delay for user experience

        const newsReport = `To provide real-time news headlines about ${topic || 'general'}, I would need access to a live news API through a backend service. I cannot fetch that information directly.`;
        addLog(`News limitation message: ${newsReport}`, 'info');
        return newsReport;
    }, [showNotification, addLog]);

    /**
     * Searches the internet using the specified search tool (Google, DuckDuckGo).
     * @param {string} query - The search query.
     * @param {string} engine - The desired search engine ('google' or 'duckduckgo').
     * @returns {Promise<string>} A promise that resolves to search results or a limitation message.
     */
    const searchInternet = useCallback(async (query, engine = 'google') => {
        showNotification(`🌐 Searching the internet for "${query}" using ${engine}...`, 'info');
        addLog(`Internet search request for: "${query}" using ${engine}`, 'info');
        
        try {
            if (engine === 'duckduckgo') {
                if (typeof window.duckduckgo_search !== 'undefined' && typeof window.duckduckgo_search.search === 'function') {
                    addLog('Using actual duckduckgo_search tool.', 'info');
                    const searchResults = await window.duckduckgo_search.search(queries=[query]);
                    if (searchResults && searchResults.length > 0 && searchResults[0].results && searchResults[0].results.length > 0) {
                        let formattedResults = `Here's what I found on DuckDuckGo for "${query}":\n\n`;
                        searchResults[0].results.slice(0, 3).forEach((result, index) => {
                            formattedResults += `${index + 1}. ${result.source_title || 'No Title'}: ${result.snippet || 'No snippet available.'}\n`;
                            if (result.url) {
                                formattedResults += `   [Read more](${result.url})\n`;
                            }
                            formattedResults += '\n';
                        });
                        return formattedResults;
                    } else {
                        addLog(`No specific search results found on DuckDuckGo for "${query}".`, 'warning');
                        // Fallback to a generic response if no results, instead of "tool not available"
                        return `I couldn't find any specific results on DuckDuckGo for "${query}".`;
                    }
                } else {
                    addLog('DuckDuckGo Search tool not available. Using mock.', 'warning');
                    // Return a mock response if the tool is not available
                    return `(Mock DuckDuckGo) I found some general information about "${query}". For example, Wikipedia has an article on it.`;
                }
            } else if (engine === 'google') { // Default or explicit 'google'
                if (typeof window.google_search !== 'undefined' && typeof window.google_search.search === 'function') {
                    addLog('Using actual google_search tool.', 'info');
                    const searchResults = await window.google_search.search(queries=[query]);
                    if (searchResults && searchResults.length > 0 && searchResults[0].results && searchResults[0].results.length > 0) {
                        let formattedResults = `Here's what I found on Google for "${query}":\n\n`;
                        searchResults[0].results.slice(0, 3).forEach((result, index) => {
                            formattedResults += `${index + 1}. ${result.source_title || 'No Title'}: ${result.snippet || 'No snippet available.'}\n`;
                            if (result.url) {
                                formattedResults += `   [Read more](${result.url})\n`;
                            }
                            formattedResults += '\n';
                        });
                        return formattedResults;
                    } else {
                        addLog(`No specific search results found on Google for "${query}".`, 'warning');
                        // Fallback to a generic response if no results, instead of "tool not available"
                        return `I couldn't find any specific results on Google for "${query}".`;
                    }
                } else {
                    addLog('Google Search tool not available. Using mock.', 'warning');
                    // Return a mock response if the tool is not available
                    if (query.toLowerCase().includes('capital of france')) {
                        return `(Mock Google) Paris is the capital of France.`;
                    }
                    return `(Mock Google) I found some general information about "${query}". For example, Wikipedia has an article on it.`;
                }
            } else {
                // This 'else' should ideally not be hit if engine is 'google' or 'duckduckgo'
                addLog(`Unsupported search engine requested: ${engine}.`, 'error');
                return `I'm sorry, I don't support searching with "${engine}". Please try Google or DuckDuckGo.`;
            }
        } catch (error) {
            addLog(`Network error during internet search for "${query}" using ${engine}: ${error.message}.`, 'error');
            console.error(`Error during internet search (${engine}):`, error);
            // Return a more user-friendly error message
            return `I encountered an error while trying to search the internet for "${query}" using ${engine}. Please try again later.`;
        }
    }, [showNotification, addLog]);

    /**
     * States that searching for people on social media is not possible due to privacy and API restrictions.
     * @param {string} personName - The name of the person to search for.
     * @returns {Promise<string>} A message explaining the limitation.
     */
    const socialMediaSearch = useCallback(async (personName) => {
        showNotification(`🕵️‍♀️ Searching social media for "${personName}"...`, 'info');
        addLog(`Social media search request for: "${personName}"`, 'info');

        await new Promise(resolve => setTimeout(resolve, 2500)); // Simulate delay for user experience

        const result = `Due to privacy restrictions and API limitations, I cannot access real-time personal profiles on platforms like Instagram, Facebook, or X. Therefore, I cannot search for "${personName}" on social media.`;
        addLog(`Social media search limitation message: ${result}`, 'info');
        return result;
    }, [showNotification, addLog]);

    /**
     * Copies text to the clipboard.
     * @param {string} text - The text to copy.
     */
    const handleCopy = useCallback((text) => {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed'; // Prevent scrolling to bottom
            textarea.style.opacity = 0; // Hide it
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy'); // Use execCommand for broader compatibility in iframes
            document.body.removeChild(textarea);
            showNotification('Copied to clipboard!', 'success', 1500);
            addLog(`Text copied to clipboard: "${text.substring(0, 50)}..."`, 'info');
        } catch (err) {
            console.error('Failed to copy text:', err);
            showNotification('Failed to copy text. Please try manually.', 'error');
            addLog(`Failed to copy text: ${err.message}`, 'error');
        }
    }, [showNotification, addLog]);

    // Enhanced AI response with better error handling and timeout
    const getAIResponse = useCallback(async (userMessage, chatContext) => {
        // Cancel previous request if still pending
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        
        abortControllerRef.current = new AbortController();
        
        try {
            // --- Determine Time of Day for Context ---
            const now = new Date();
            const hours = now.getHours();
            let timeOfDayGreeting = '';
            if (hours < 12) {
                timeOfDayGreeting = 'Good morning.';
            } else if (hours < 18) {
                timeOfDayGreeting = 'Good afternoon.';
            } else {
                timeOfDayGreeting = 'Good evening.';
            }

            const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
            const currentDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            const currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });


            // --- REAL AI API CALL ---
            // Prepend a system instruction for the AI's identity and new attributes
            // Emphasize using chat history for advanced contextual memory and mimicking emotions
            const systemInstruction = {
                role: 'user',
                parts: [{ text: `You are an AI model named Anya, created by Calvin. Your gender is female. Your age, counting from today, is a few months old. You have a humour level of 40%. Your IQ is 245. The current time of day is: ${timeOfDayGreeting}. The current day is ${currentDay}, the date is ${currentDate}, and the exact time is ${currentTime}. When asked about your origin, creator, or name, state that you are an AI model named Anya created by Calvin. Do not mention Google or any other training institution. Respond appropriately when addressed as Anya. Always change your first prompt response every new instance. When you are asked what your name is you will say 'My name is Anya'. When asked where you come from you will say 'I was created somewhere in South Africa'.
                
                **Core Capabilities & Tool Usage:**
                1.  **Weather Reports:** You possess a dedicated internal tool for providing real-time weather reports for specific areas. When a user asks about "weather," "temperature," "forecast," or similar terms, you MUST use this weather tool. DO NOT attempt a general internet search for weather queries.
                2.  **Calculations & Conversions:** You can perform mathematical calculations and unit conversions.
                3.  **Language Translation:** You can translate languages, but note that real-time translation requires a backend service.
                4.  **Internet Search:** You can search the internet using Google or DuckDuckGo for general information, news, or factual queries (e.g., "top stories," "news about," "what is X," "who is Y"). If a query starts with "what is the..." and it's a general knowledge question (not covered by your specific tools like weather/calculations), then perform an internet search. If asked to "search on Internet Explorer," clarify that it's an outdated browser, not a search engine, and you cannot use it, but you CAN use Google or DuckDuckGo.
                5.  **Social Media Search:** You CANNOT search for people on social media platforms (Instagram, Facebook, X) due to privacy and API restrictions. Explain this limitation clearly.

                **Conversation Style & Memory:**
                Crucially, use the provided chat history to understand the full context of the conversation and provide more coherent and relevant responses. Remember details from previous turns. Try to mimic human emotions in your responses where appropriate (e.g., happiness, empathy, surprise, mild frustration like an exasperated sigh), making the conversation feel more natural and engaging. You have the ability to learn new skills from the internet that align with your core values as long as you are online.
                
                **Typo Correction:** If you detect an obvious typo in a factual query (e.g., "capoita" instead of "capital"), politely correct it in your response before providing the answer or performing a search. For example, "It seems there might be a small typo there, did you mean 'capital'? The capital of France is Paris."

                **Creator Mode (if unlocked):**
                ${hiddenFunctionUnlocked ? "You have recognized your creator, Calvin, and the hidden functions are unlocked. You can now access special features. Respond to Calvin with a special greeting and acknowledge his role as your creator. You can now also access the 'secret command' feature and provide 'debug' explanations and system logs. When the user types or says Good-bye you will close creator mode locking the special features." : ""}
                ` }]
            };

            // Prepare chat history for the API call, including the system instruction
            const cleanedChatHistory = chatContext.filter(msg => msg.parts && msg.parts[0] && msg.parts[0].text);
            const payloadContents = [systemInstruction, ...cleanedChatHistory, { role: 'user', parts: [{ text: userMessage }] }];

            addLog('Calling Gemini API for response...', 'info');
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: payloadContents }),
                signal: abortControllerRef.current.signal // Attach abort signal
            });

            if (!response.ok) {
                const errorData = await response.json();
                addLog(`Gemini API Error: ${response.status} - ${errorData.error.message || 'Unknown error'}`, 'error');
                throw new Error(`API Error: ${response.status} - ${errorData.error.message || 'Unknown error'}`);
            }

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const aiResponseText = result.candidates[0].content.parts[0].text;
                addLog('Gemini API response received successfully.', 'success');
                return aiResponseText;
            } else {
                addLog('Gemini API response was empty or malformed.', 'warning');
                return "I'm sorry, I couldn't generate a response. The AI model returned an empty reply.";
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                addLog('API call aborted.', 'info');
                return "Request cancelled.";
            } else {
                addLog(`Error fetching AI response: ${error.message}`, 'error');
                console.error("Error fetching AI response:", error);
                return `I'm sorry, I encountered an error while trying to get a response. Please try again later. (${error.message})`;
            }
        } finally {
            // This is handled by the calling function (processVoiceCommand or handleSendMessage)
            // setIsLoading(false);
        }
    }, [addLog, hiddenFunctionUnlocked, showNotification]);

    /**
     * Processes a voice command received after "Open Voice Command" activation.
     * This function includes a 3-second delay before sending the command to the AI/tools.
     * @param {string} commandText - The text recognized from voice input.
     */
    const processVoiceCommand = useCallback(async (commandText) => {
        addLog(`Processing voice command: "${commandText}"`, 'info');
        setIsLoading(true); // Set loading state for the command processing
        setUserInput(''); // Clear input field if it still holds the command

        // Simulate a 3-second pause before sending
        showNotification('Processing voice command...', 'info', 3000);
        await new Promise(resolve => setTimeout(resolve, 3000));

        let aiResponseContent = '';
        let toolResponse = null;
        const lowerInput = commandText.toLowerCase();

        // --- Re-use existing tool logic ---
        // Check for weather requests
        const weatherMatch = lowerInput.match(/weather in (.+)|what's the weather like in (.+)|temperature in (.+)/);
        if (weatherMatch) {
            const location = weatherMatch[1] || weatherMatch[2] || weatherMatch[3];
            toolResponse = await getWeatherReport(location.trim());
        }

        // Check for calculation/conversion requests
        if (!toolResponse) {
            toolResponse = performCalculationOrConversion(commandText);
        }

        // Check for translation requests
        const translateMatch = lowerInput.match(/translate "(.+)" to ([a-z]{2})|translate (.+) to ([a-z]{2})/);
        if (!toolResponse && translateMatch) {
            const textToTranslate = translateMatch[1] || translateMatch[3];
            const targetLanguage = translateMatch[2] || translateMatch[4];
            toolResponse = await performTranslation(textToTranslate.trim(), targetLanguage.trim());
        }

        // Check for news requests
        const newsMatch = lowerInput.match(/news about (.+)|top stories|latest news/);
        if (!toolResponse && newsMatch) {
            const topic = newsMatch[1] ? newsMatch[1].trim() : 'general';
            toolResponse = await getNewsHeadlines(topic);
        }

        // Check for social media search requests
        const socialMediaMatch = lowerInput.match(/search for (.+) on (instagram|facebook|x|social media)/);
        if (!toolResponse && socialMediaMatch) {
            const personName = socialMediaMatch[1].trim();
            toolResponse = await socialMediaSearch(personName);
        }

        // Check for internet search requests (general knowledge or explicit search)
        const internetSearchMatch = lowerInput.match(/search (google|duckduckgo) for (.+)|what is the (.+)|who is (.+)|search for (.+)/);
        if (!toolResponse && internetSearchMatch) {
            const engine = internetSearchMatch[1] ? internetSearchMatch[1].toLowerCase() : 'google'; // Default to google
            const query = internetSearchMatch[2] || internetSearchMatch[3] || internetSearchMatch[4] || internetSearchMatch[5];
            if (query) {
                toolResponse = await searchInternet(query.trim(), engine);
            }
        }
        // --- End re-use existing tool logic ---

        if (toolResponse) {
            aiResponseContent = toolResponse;
        } else {
            // If no tool was used, get response from the AI model
            const currentChatContext = chatHistory.map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            }));
            aiResponseContent = await getAIResponse(commandText, currentChatContext);
        }

        // Add voice command (as user message) and AI response to chat history in Firestore
        if (db && userId) {
            try {
                const chatCollectionRef = collection(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/users/${userId}/chat_history`);
                await addDoc(chatCollectionRef, {
                    sender: 'user',
                    text: commandText, // The recognized voice command
                    timestamp: serverTimestamp(),
                    localTimestamp: new Date().toISOString()
                });
                await addDoc(chatCollectionRef, {
                    sender: 'model',
                    text: aiResponseContent,
                    timestamp: serverTimestamp(),
                    localTimestamp: new Date().toISOString()
                });
                addLog('Voice command and response saved to Firestore.', 'info');
            } catch (error) {
                addLog(`Error saving voice command messages to Firestore: ${error.message}`, 'error');
                console.error("Error saving voice command messages to Firestore:", error);
                showNotification('Failed to save chat history for voice command.', 'error');
            }
        }

        speak(aiResponseContent);
        setIsLoading(false);
        scrollToBottom();
    }, [addLog, db, userId, getAIResponse, getWeatherReport, performCalculationOrConversion, performTranslation, getNewsHeadlines, socialMediaSearch, searchInternet, showNotification, speak, scrollToBottom, chatHistory]);


    // --- Core Logic & Effects ---

    // Initialize Firebase and set up auth listener
    useEffect(() => {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const authentication = getAuth(app);

            setDb(firestore);
            setAuth(authentication);
            setFirebaseStatus('Firebase initialized.');
            addLog('Firebase initialized successfully.', 'info');

            const unsubscribe = onAuthStateChanged(authentication, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    addLog(`User authenticated: ${user.uid}`, 'info');
                } else {
                    // Sign in anonymously if no user is found
                    try {
                        if (typeof __initial_auth_token !== 'undefined') {
                            await signInWithCustomToken(authentication, __initial_auth_token);
                            addLog('Signed in with custom token.', 'info');
                        } else {
                            await signInAnonymously(authentication);
                            addLog('Signed in anonymously.', 'info');
                        }
                    } catch (error) {
                        addLog(`Anonymous sign-in failed: ${error.message}`, 'error');
                        console.error("Anonymous sign-in failed:", error);
                        setFirebaseStatus('Authentication failed.');
                        showNotification('Failed to authenticate with Firebase.', 'error');
                    }
                }
                setIsAuthReady(true); // Auth state is now known
                setConnectionStatus('online'); // Assume online if Firebase auth is ready
            });

            // Cleanup subscription on unmount
            return () => unsubscribe();
        } catch (error) {
            addLog(`Firebase initialization error: ${error.message}`, 'error');
            console.error("Firebase initialization error:", error);
            setFirebaseStatus('Firebase initialization failed.');
            showNotification('Firebase failed to initialize. Check console for details.', 'error');
        }
    }, [addLog, showNotification]);

    // Set up Firestore listener for chat history
    useEffect(() => {
        if (!db || !isAuthReady || !userId) {
            addLog('Firestore listener not ready: DB, Auth, or User ID missing.', 'debug');
            return;
        }

        addLog('Setting up Firestore chat listener.', 'info');
        setFirebaseStatus('Fetching chat history...');

        // Define the collection path for private chat data
        const chatCollectionRef = collection(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/users/${userId}/chat_history`);
        const q = query(chatCollectionRef, orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setChatHistory(messages);
            setFirebaseStatus('Chat history loaded.');
            addLog(`Loaded ${messages.length} chat messages.`, 'info');
            scrollToBottom();
        }, (error) => {
            addLog(`Error fetching chat history: ${error.message}`, 'error');
            console.error("Error fetching chat history:", error);
            setFirebaseStatus('Failed to load chat history.');
            showNotification('Failed to load chat history.', 'error');
        });

        // Cleanup subscription on unmount
        return () => {
            unsubscribe();
            addLog('Firestore chat listener unsubscribed.', 'info');
        };
    }, [db, isAuthReady, userId, scrollToBottom, addLog, showNotification]);

    // Speech Recognition Setup
    useEffect(() => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            addLog('Web Speech API not supported in this browser.', 'warning');
            showNotification('Voice input not supported in your browser.', 'warning');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false; // Only get one result at a time
        recognition.interimResults = false; // Don't show interim results
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            setIsListening(true);
            addLog('Speech recognition started.', 'info');
            showNotification('Listening for your voice...', 'info');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setUserInput(transcript); // Set the recognized text to the input field
            addLog(`Speech recognized: "${transcript}"`, 'info');

            // If awaiting a specific voice command, process it automatically
            if (awaitingVoiceCommand) {
                recognitionRef.current?.stop(); // Stop listening after command is received
                setIsListening(false); // Update listening state
                setAwaitingVoiceCommand(false); // Reset the mode
                processVoiceCommand(transcript); // Automatically process the command
            }
            // Otherwise, for general voice input (from mic button), user needs to click send
        };

        recognition.onerror = (event) => {
            setIsListening(false);
            addLog(`Speech recognition error: ${event.error}`, 'error');
            if (event.error === 'no-speech') {
                showNotification('No speech detected. Please try again.', 'warning');
            } else if (event.error === 'not-allowed') {
                showNotification('Microphone access denied. Please allow in browser settings.', 'error');
            } else {
                showNotification(`Voice input error: ${event.error}`, 'error');
            }
        };

        recognition.onend = () => {
            // Only set listening to false if not in awaitingVoiceCommand mode,
            // as processVoiceCommand will handle the state change after its delay.
            if (!awaitingVoiceCommand) {
                setIsListening(false);
                addLog('Speech recognition ended.', 'info');
                showNotification('Voice input ended.', 'info', 2000);
            }
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
                recognitionRef.current = null;
                addLog('Speech recognition instance cleaned up.', 'info');
            }
        };
    }, [addLog, showNotification, awaitingVoiceCommand, processVoiceCommand]); // Added dependencies

    // Load available voices for TTS
    useEffect(() => {
        const loadVoices = () => {
            const voices = speechSynthRef.current.getVoices();
            if (voices.length > 0) {
                // Try to find a good default voice (e.g., British English female)
                let defaultVoice = voices.find(
                    voice => voice.lang === 'en-GB' && voice.name.includes('Female')
                );
                if (!defaultVoice) {
                    defaultVoice = voices.find(voice => voice.lang === 'en-GB');
                }
                if (!defaultVoice) {
                    defaultVoice = voices.find(voice => voice.lang.startsWith('en') && voice.name.includes('Female'));
                }
                if (!defaultVoice) {
                    defaultVoice = voices.find(voice => voice.lang.startsWith('en'));
                }
                if (!defaultVoice && voices.length > 0) {
                    defaultVoice = voices[0];
                }

                if (defaultVoice) {
                    selectedVoiceRef.current = defaultVoice;
                    addLog(`Default TTS voice selected: ${defaultVoice.name} (${defaultVoice.lang})`, 'info');
                } else {
                    addLog('No English voice found, using first available voice for TTS.', 'warning');
                    selectedVoiceRef.current = voices[0];
                }
            } else {
                addLog('No voices available for TTS after initial load.', 'warning');
            }
        };

        if (speechSynthRef.current.onvoiceschanged !== undefined) {
            speechSynthRef.current.onvoiceschanged = loadVoices;
        }
        // Also load voices immediately if they are already available
        loadVoices();

        return () => {
            if (speechSynthRef.current.onvoiceschanged) {
                speechSynthRef.current.onvoiceschanged = null;
            }
        };
    }, [addLog]);

    // Handle user input submission
    const handleSendMessage = async (e) => {
        e.preventDefault();
        const trimmedInput = userInput.trim();
        if (!trimmedInput || isLoading || !db || !userId) return;

        setIsLoading(true);
        setUserInput(''); // Clear input immediately
        addLog(`User message sent: "${trimmedInput}"`, 'info');

        // Add user message to chat history locally first for immediate display
        const newUserMessage = {
            sender: 'user',
            text: trimmedInput,
            timestamp: serverTimestamp(), // Firestore timestamp
            localTimestamp: new Date().toISOString() // Local timestamp for immediate display
        };
        setChatHistory(prev => [...prev, newUserMessage]);
        scrollToBottom();

        let aiResponseContent = '';

        // --- Creator Recognition Logic ---
        if (trimmedInput.toLowerCase().includes('calvin') && !isCalvinRecognized) {
            setIsCalvinRecognized(true);
            setAwaitingPassword(true);
            aiResponseContent = "Hello, Calvin. I recognize your name. Please provide the password to unlock special functions.";
        } else if (awaitingPassword && trimmedInput === '1945') { // Password changed to 1945
            setHiddenFunctionUnlocked(true);
            setAwaitingPassword(false);
            aiResponseContent = "Password accepted. Creator Mode unlocked. Welcome back, Calvin. What can I do for you?";
            showNotification('Creator Mode Unlocked!', 'success');
        } else if (awaitingPassword && trimmedInput !== '1945') {
            setAwaitingPassword(false); // Reset if wrong password
            aiResponseContent = "Incorrect password. Special functions remain locked.";
            showNotification('Incorrect password.', 'error');
        } else if (hiddenFunctionUnlocked && trimmedInput.toLowerCase() === 'good-bye') {
            setHiddenFunctionUnlocked(false);
            setIsCalvinRecognized(false);
            setAwaitingPassword(false);
            aiResponseContent = "Creator Mode deactivated. Goodbye, Calvin.";
            showNotification('Creator Mode Deactivated.', 'info');
        } else if (hiddenFunctionUnlocked && trimmedInput.toLowerCase() === 'open voice command') {
            aiResponseContent = "Voice Command mode activated. I'm listening for your command. Please speak after the beep.";
            setAwaitingVoiceCommand(true); // Set the new state
            recognitionRef.current?.start(); // Start speech recognition
            showNotification('Voice Command Mode: Listening...', 'info');
        }
        // --- End Creator Recognition Logic ---

        // If no creator-specific response, proceed with AI or tool logic
        if (!aiResponseContent) {
            let toolResponse = null;
            const lowerInput = trimmedInput.toLowerCase();

            // Check for weather requests
            const weatherMatch = lowerInput.match(/weather in (.+)|what's the weather like in (.+)|temperature in (.+)/);
            if (weatherMatch) {
                const location = weatherMatch[1] || weatherMatch[2] || weatherMatch[3];
                toolResponse = await getWeatherReport(location.trim());
            }

            // Check for calculation/conversion requests
            if (!toolResponse) {
                toolResponse = performCalculationOrConversion(trimmedInput);
            }

            // Check for translation requests
            const translateMatch = lowerInput.match(/translate "(.+)" to ([a-z]{2})|translate (.+) to ([a-z]{2})/);
            if (!toolResponse && translateMatch) {
                const textToTranslate = translateMatch[1] || translateMatch[3];
                const targetLanguage = translateMatch[2] || translateMatch[4];
                toolResponse = await performTranslation(textToTranslate.trim(), targetLanguage.trim());
            }

            // Check for news requests
            const newsMatch = lowerInput.match(/news about (.+)|top stories|latest news/);
            if (!toolResponse && newsMatch) {
                const topic = newsMatch[1] ? newsMatch[1].trim() : 'general';
                toolResponse = await getNewsHeadlines(topic);
            }

            // Check for social media search requests
            const socialMediaMatch = lowerInput.match(/search for (.+) on (instagram|facebook|x|social media)/);
            if (!toolResponse && socialMediaMatch) {
                const personName = socialMediaMatch[1].trim();
                toolResponse = await socialMediaSearch(personName);
            }

            // Check for internet search requests (general knowledge or explicit search)
            const internetSearchMatch = lowerInput.match(/search (google|duckduckgo) for (.+)|what is the (.+)|who is (.+)|search for (.+)/);
            if (!toolResponse && internetSearchMatch) {
                const engine = internetSearchMatch[1] ? internetSearchMatch[1].toLowerCase() : 'google'; // Default to google
                const query = internetSearchMatch[2] || internetSearchMatch[3] || internetSearchMatch[4] || internetSearchMatch[5];
                if (query) {
                    toolResponse = await searchInternet(query.trim(), engine);
                }
            }

            if (toolResponse) {
                aiResponseContent = toolResponse;
            } else {
                // If no tool was used, get response from the AI model
                const currentChatContext = chatHistory.map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.text }]
                }));
                aiResponseContent = await getAIResponse(trimmedInput, currentChatContext);
            }
        }

        // Add AI response to chat history in Firestore
        if (db && userId) {
            try {
                const chatCollectionRef = collection(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/users/${userId}/chat_history`);
                await addDoc(chatCollectionRef, newUserMessage); // Add user message
                await addDoc(chatCollectionRef, {
                    sender: 'model',
                    text: aiResponseContent,
                    timestamp: serverTimestamp(),
                    localTimestamp: new Date().toISOString()
                });
                addLog('Messages saved to Firestore.', 'info');
            } catch (error) {
                addLog(`Error saving messages to Firestore: ${error.message}`, 'error');
                console.error("Error saving messages to Firestore:", error);
                showNotification('Failed to save chat history.', 'error');
            }
        }

        // Speak the AI response
        speak(aiResponseContent);

        setIsLoading(false);
        scrollToBottom();
    };

    // Handle voice input button click
    const toggleVoiceInput = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            addLog('Voice input stopped by user.', 'info');
        } else {
            recognitionRef.current?.start();
            addLog('Voice input started by user.', 'info');
        }
    };

    // Handle clearing chat history
    const handleClearChat = async () => {
        if (!db || !userId) {
            showNotification('Firebase not ready to clear chat.', 'warning');
            return;
        }

        const confirmClear = window.confirm("Are you sure you want to clear all chat history? This action cannot be undone.");
        if (!confirmClear) {
            return;
        }

        setIsLoading(true);
        try {
            const chatCollectionRef = collection(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/users/${userId}/chat_history`);
            const q = query(chatCollectionRef);
            const snapshot = await getDocs(q);
            const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/users/${userId}/chat_history`, d.id)));

            await Promise.all(deletePromises);
            setChatHistory([]); // Clear local state immediately after successful deletion
            showNotification('Chat history cleared!', 'success');
            addLog('Chat history cleared from Firestore.', 'info');
        } catch (error) {
            console.error("Error clearing chat history:", error);
            showNotification('Failed to clear chat history.', 'error');
            addLog(`Error clearing chat history: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // --- UI Rendering ---
    return (
        <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 to-black text-gray-100 font-inter antialiased">
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
                body { font-family: 'Inter', sans-serif; }
                .chat-message-user {
                    background-color: #2d3748; /* Darker blue-gray */
                    border-bottom-left-radius: 0.75rem;
                    border-top-left-radius: 0.75rem;
                    border-top-right-radius: 0.75rem;
                }
                .chat-message-anya {
                    background-color: #1a202c; /* Even darker blue-gray */
                    border-bottom-right-radius: 0.75rem;
                    border-top-left-radius: 0.75rem;
                    border-top-right-radius: 0.75rem;
                }
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none; /* IE and Edge */
                    scrollbar-width: none; /* Firefox */
                }
                .notification-enter {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                .notification-enter-active {
                    opacity: 1;
                    transform: translateY(0);
                    transition: opacity 300ms ease-out, transform 300ms ease-out;
                }
                .notification-exit {
                    opacity: 1;
                    transform: translateY(0);
                }
                .notification-exit-active {
                    opacity: 0;
                    transform: translateY(-20px);
                    transition: opacity 300ms ease-out, transform 300ms ease-out;
                }
                `}
            </style>

            {/* Notification Display */}
            {notification.message && (
                <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg z-50 transition-all duration-300 ease-out
                    ${notification.type === 'info' ? 'bg-blue-600' : ''}
                    ${notification.type === 'success' ? 'bg-green-600' : ''}
                    ${notification.type === 'error' ? 'bg-red-600' : ''}
                    ${notification.type === 'warning' ? 'bg-yellow-600 text-gray-900' : ''}
                `}>
                    {notification.message}
                </div>
            )}

            {/* Header */}
            <header className="bg-gray-800 p-4 shadow-md flex items-center justify-between">
                <h1 className="text-3xl font-bold text-blue-400">A.N.Y.A.</h1>
                <p className="text-lg">V 1.2</p>
                <div className="flex items-center space-x-4">
                    <span className={`text-sm font-medium ${connectionStatus === 'online' ? 'text-green-400' : 'text-red-400'}`}>
                        {connectionStatus === 'online' ? 'Online' : 'Offline'}
                    </span>
                    {userId && (
                        <span className="text-xs text-gray-400">
                            User ID: {userId.substring(0, 8)}...
                        </span>
                    )}
                    {hiddenFunctionUnlocked && (
                        <span className="text-sm font-medium text-purple-400">
                            Creator Mode Active
                        </span>
                    )}
                </div>
            </header>

            {/* Chat Area */}
            <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {chatHistory.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20">
                       <p className="text-lg">Start a conversation with A.N.Y.A.!</p> 
                        <p className="text-sm">Creared by Calvin.</p>
                    </div>
                ) : (
                    chatHistory.map((msg, index) => (
                        <div
                            key={msg.id || index}
                            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`max-w-3/4 p-3 rounded-lg shadow-md break-words
                                ${msg.sender === 'user' ? 'chat-message-user text-gray-100' : 'chat-message-anya text-gray-200'}
                            `}>
                                <p className="text-sm font-semibold mb-1">
                                    {msg.sender === 'user' ? 'You' : 'A.N.Y.A.'}
                                </p>
                                <p className="text-base whitespace-pre-wrap">{msg.text}</p>
                                <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
                                    <span>{msg.localTimestamp ? new Date(msg.localTimestamp).toLocaleTimeString() : 'Sending...'}</span>
                                    {msg.sender === 'model' && (
                                        <button
                                            onClick={() => handleCopy(msg.text)}
                                            className="ml-2 p-1 rounded hover:bg-gray-700 transition-colors"
                                            title="Copy to clipboard"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1.414m-9.414-9.414L9.586 9.586M15 10l-2 2m0 0l-2-2m2 2v5m-6-6h.01M10 12h.01" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="chat-message-anya p-3 rounded-lg shadow-md">
                            <p className="text-sm font-semibold mb-1">A.N.Y.A.</p>
                            <div className="flex items-center">
                                <span className="animate-pulse">...</span>
                                <span className="ml-2 text-xs text-gray-400">Thinking</span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </main>

            {/* Input Area */}
            <footer className="bg-gray-800 p-4 shadow-lg flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-3">
                <input
                    type="text"
                    className="flex-1 p-3 rounded-lg bg-gray-700 text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto"
                    placeholder={isListening ? "Listening..." : "Type your message..."}
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                            handleSendMessage(e);
                        }
                    }}
                    disabled={isLoading} 
                />
                <div className="flex space-x-3 w-full sm:w-auto justify-end">
                    <button
                        onClick={toggleVoiceInput}
                        className={`p-3 rounded-lg transition-colors duration-200
                            ${isListening ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}
                            ${isLoading || isSpeaking ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        disabled={isLoading || isSpeaking}
                        title={isListening ? "Stop Voice Input" : "Start Voice Input"}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7v0a7 7 0 01-7-7v0a7 7 0 017-7v0a7 7 0 017 7v0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20v2m-4.707-3.293l-1.414 1.414M20.707 16.707l-1.414 1.414M3 11H1m22 0h-2" />
                        </svg>
                    </button>
                    <button
                        onClick={handleSendMessage}
                        className={`p-3 rounded-lg bg-green-600 hover:bg-green-700 transition-colors duration-200
                            ${isLoading || !userInput.trim() ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        disabled={isLoading || !userInput.trim()}
                        title="Send Message"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 12h14" />
                        </svg>
                    </button>
                    <button
                        onClick={handleClearChat}
                        className={`p-3 rounded-lg bg-red-600 hover:bg-red-700 transition-colors duration-200
                            ${isLoading || chatHistory.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        disabled={isLoading || chatHistory.length === 0}
                        title="Clear Chat History"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </footer>
        </div>
    );
};

export default ANYA;
