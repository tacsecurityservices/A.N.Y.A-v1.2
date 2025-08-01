import React, { useState, useEffect, useRef, useCallback } from 'react';

// Main A.N.Y.A. component
const ANYA = () => {
    // Chat states
    const [chatHistory, setChatHistory] = useState([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [notification, setNotification] = useState({ message: '', type: '' });
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [systemLogs, setSystemLogs] = useState([]);
    const [userInterests, setUserInterests] = useState([]);

    // Creator Recognition & Hidden Function States
    const [isCalvinRecognized, setIsCalvinRecognized] = useState(false);
    const [awaitingPassword, setAwaitingPassword] = useState(false);
    const [hiddenFunctionUnlocked, setHiddenFunctionUnlocked] = useState(false);
    const [awaitingVoiceCommand, setAwaitingVoiceCommand] = useState(false);
    const [isOnline, setIsOnline] = useState(true);

    // Refs for UI elements
    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);
    const speechSynthRef = useRef(null);
    const selectedVoiceRef = useRef(null);
    
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
            showNotification('Speech output not available in your browser.', 'error');
            return;
        }

        let voiceToUse = selectedVoiceRef.current;
        const availableVoices = speechSynthRef.current.getVoices();

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
                voiceToUse = foundVoice;
                addLog(`Re-selected voice: ${foundVoice.name} (${foundVoice.lang})`, 'info');
            } else {
                addLog('No suitable voice found for speech synthesis. Cannot speak.', 'warning');
                showNotification('No voice available for speech output. Check browser settings.', 'warning');
                return;
            }
        }

        if (speechSynthRef.current.speaking) {
            speechSynthRef.current.cancel();
            addLog('Cancelled ongoing speech.', 'info');
        }

        addLog(`Attempting to speak "${text.substring(0, Math.min(text.length, 50))}..." with voice: ${voiceToUse?.name || 'N/A'} (${voiceToUse?.lang || 'N/A'})`, 'debug');

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voiceToUse;
        utterance.rate = 1;
        utterance.pitch = 1;

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
            const errorMessage = event.error || 'Unknown error during synthesis.';
            addLog(`Speech synthesis error: ${errorMessage}`, 'error');
            showNotification(`Speech error: ${errorMessage}. Try refreshing the page.`, 'error');
        };

        try {
            speechSynthRef.current.speak(utterance);
        } catch (e) {
            addLog(`Error calling speechSynth.speak(): ${e.message}`, 'error');
            showNotification(`Failed to initiate speech: ${e.message}`, 'error');
        }
    }, [addLog, showNotification]);

    /**
     * Fetches a real-time weather report for a given location using Open-Meteo API.
     * @param {string} location - The location for which to get the weather.
     * @returns {Promise<string>} A promise that resolves to a weather report string.
     */
    const getWeatherReport = useCallback(async (location) => {
        showNotification(`🌤️ Getting live weather for ${location}...`, 'info');
        addLog(`Weather request for: ${location} using Open-Meteo API.`, 'info');

        try {
            const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
            const geoResponse = await fetch(geocodingUrl);
            const geoData = await geoResponse.json();

            if (!geoResponse.ok || !geoData.results || geoData.results.length === 0) {
                addLog(`Geocoding failed for "${location}": ${geoData.reason || 'No results found'}`, 'warning');
                return `🤔 I couldn't find a location called "${location}". Please check the spelling or try a more specific name.`;
            }

            const { latitude, longitude, name, country } = geoData.results[0];
            addLog(`Found coordinates for ${name}, ${country}: Lat ${latitude}, Lon ${longitude}`, 'info');

            const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,relative_humidity_2m&timezone=auto&forecast_days=1`;
            const weatherResponse = await fetch(weatherApiUrl);
            const weatherData = await weatherResponse.json();

            if (weatherResponse.ok && weatherData.current) {
                const temp = weatherData.current.temperature_2m;
                const humidity = weatherData.current.relative_humidity_2m;
                const windSpeed = weatherData.current.wind_speed_10m;
                
                addLog(`Weather data retrieved for ${name}, ${country}.`, 'success');
                return `🌡️ The current weather in ${name}, ${country} is ${temp}°C. Humidity is ${humidity}% and wind speed is ${windSpeed} km/h.`;
            } else {
                addLog(`Open-Meteo weather API error for ${name}, ${country}: ${weatherData.reason || weatherResponse.statusText}`, 'error');
                return `I encountered an error while fetching weather data for ${name}, ${country}: ${weatherData.reason || 'Unknown error'}. Please try again later.`;
            }
        } catch (error) {
            addLog(`Network error during weather API call: ${error.message}`, 'error');
            return `I'm sorry, I couldn't fetch the weather data due to a network issue: ${error.message}`;
        }
    }, [showNotification, addLog]);

    /**
     * Performs calculations or unit conversions.
     * @param {string} query - The user's query.
     * @returns {string|null} The result or null if not a calculation/conversion.
     */
    const performCalculationOrConversion = useCallback((query) => {
        const lowerQuery = query.toLowerCase();

        // Math calculation
        const mathMatch = lowerQuery.match(/(?:what is|calculate)\s+([\d\s\+\-\*\/\(\)\.]+)/);
        if (mathMatch && mathMatch[1]) {
            try {
                const expression = mathMatch[1].replace(/x/g, '*').replace(/÷/g, '/');
                // Simple evaluation - be careful with eval in production
                const result = Function('"use strict"; return (' + expression + ')')();
                addLog(`Calculation: "${expression}" = ${result}`, 'info');
                return `The result is: ${result}`;
            } catch (e) {
                addLog(`Calculation error: ${e.message}`, 'error');
                return "I'm sorry, I couldn't perform that calculation.";
            }
        }

        // Unit conversion
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
            } else if (conversions[toUnit] && conversions[toUnit][fromUnit]) {
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
     * Mock translation function
     */
    const performTranslation = useCallback(async (text, targetLang) => {
        showNotification(`Translating "${text}" to ${targetLang}...`, 'info');
        addLog(`Translation request: "${text}" to ${targetLang}`, 'info');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const translatedText = `Real-time translation for "${text}" to ${targetLang} requires a backend service with a translation API. I can't perform that directly.`;
        addLog(`Translation limitation message: ${translatedText}`, 'info');
        return translatedText;
    }, [showNotification, addLog]);

    /**
     * Mock news function
     */
    const getNewsHeadlines = useCallback(async (topic) => {
        showNotification(`📰 Fetching news about ${topic || 'general'}...`, 'info');
        addLog(`News request for topic: ${topic || 'general'}`, 'info');
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        const newsReport = `To provide real-time news headlines about ${topic || 'general'}, I would need access to a live news API through a backend service. I cannot fetch that information directly.`;
        addLog(`News limitation message: ${newsReport}`, 'info');
        return newsReport;
    }, [showNotification, addLog]);

    /**
     * Mock internet search function
     */
    const searchInternet = useCallback(async (query, engine = 'google') => {
        showNotification(`🌐 Searching the internet for "${query}" using ${engine}...`, 'info');
        addLog(`Internet search request for: "${query}" using ${engine}`, 'info');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return `(Mock Search) I found some general information about "${query}" using ${engine}. For example, Wikipedia has an article on it.`;
    }, [showNotification, addLog]);

    /**
     * Mock social media search
     */
    const socialMediaSearch = useCallback(async (personName) => {
        showNotification(`🕵️‍♀️ Searching social media for "${personName}"...`, 'info');
        addLog(`Social media search request for: "${personName}"`, 'info');

        await new Promise(resolve => setTimeout(resolve, 2500));

        const result = `Due to privacy restrictions and API limitations, I cannot access real-time personal profiles on platforms like Instagram, Facebook, or X. Therefore, I cannot search for "${personName}" on social media.`;
        addLog(`Social media search limitation message: ${result}`, 'info');
        return result;
    }, [showNotification, addLog]);

    /**
     * Copies text to the clipboard.
     */
    const handleCopy = useCallback((text) => {
        try {
            navigator.clipboard.writeText(text).then(() => {
                showNotification('Copied to clipboard!', 'success', 1500);
                addLog(`Text copied to clipboard: "${text.substring(0, 50)}..."`, 'info');
            }).catch(() => {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showNotification('Copied to clipboard!', 'success', 1500);
                addLog(`Text copied to clipboard: "${text.substring(0, 50)}..."`, 'info');
            });
        } catch (err) {
            showNotification('Failed to copy text. Please try manually.', 'error');
            addLog(`Failed to copy text: ${err.message}`, 'error');
        }
    }, [showNotification, addLog]);

    /**
     * AI response function
     */
    const getAIResponse = useCallback(async (userMessage) => {
        addLog('Using hardcoded AI response logic.', 'info');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const responses = [
            `Hello! I am A.N.Y.A., an AI assistant created by Calvin. You asked: "${userMessage}". How can I help you with that?`,
            `I understand you're asking about "${userMessage}". I'm here to help with various tasks like weather reports, calculations, and conversations.`,
            `That's an interesting question about "${userMessage}". As your AI assistant, I'm designed to help with information, calculations, and various tasks.`,
            `Thanks for your message about "${userMessage}". I'm A.N.Y.A., and I'm here to assist you with anything you need.`
        ];
        
        return responses[Math.floor(Math.random() * responses.length)];
    }, [addLog]);

    /**
     * Processes voice commands
     */
    const processVoiceCommand = useCallback(async (commandText) => {
        addLog(`Processing voice command: "${commandText}"`, 'info');
        setIsLoading(true);
        setUserInput('');

        showNotification('Processing voice command...', 'info', 3000);
        await new Promise(resolve => setTimeout(resolve, 3000));

        let aiResponseContent = '';
        let toolResponse = null;
        const lowerInput = commandText.toLowerCase();

        // Check for weather
        const weatherMatch = lowerInput.match(/weather in (.+)|what's the weather like in (.+)|temperature in (.+)/);
        if (weatherMatch) {
            const location = weatherMatch[1] || weatherMatch[2] || weatherMatch[3];
            toolResponse = await getWeatherReport(location.trim());
        }

        // Check for calculations
        if (!toolResponse) {
            toolResponse = performCalculationOrConversion(commandText);
        }

        // Check for translation
        const translateMatch = lowerInput.match(/translate "(.+)" to ([a-z]{2})|translate (.+) to ([a-z]{2})/);
        if (!toolResponse && translateMatch) {
            const textToTranslate = translateMatch[1] || translateMatch[3];
            const targetLanguage = translateMatch[2] || translateMatch[4];
            toolResponse = await performTranslation(textToTranslate.trim(), targetLanguage.trim());
        }

        // Other checks...
        if (toolResponse) {
            aiResponseContent = toolResponse;
        } else {
            aiResponseContent = await getAIResponse(commandText);
        }

        const newChat = [
            ...chatHistory,
            { sender: 'user', text: commandText, localTimestamp: new Date().toISOString() },
            { sender: 'model', text: aiResponseContent, localTimestamp: new Date().toISOString() }
        ];

        setChatHistory(newChat);
        speak(aiResponseContent);
        setIsLoading(false);
        scrollToBottom();
    }, [addLog, getAIResponse, getWeatherReport, performCalculationOrConversion, performTranslation, showNotification, speak, scrollToBottom, chatHistory]);

    // Initialize speech synthesis
    useEffect(() => {
        speechSynthRef.current = window.speechSynthesis;
    }, []);

    // Load chat history from memory (since we can't use localStorage)
    useEffect(() => {
        addLog('A.N.Y.A. initialized and ready.', 'success');
        scrollToBottom();
    }, [addLog, scrollToBottom]);

    // Speech Recognition Setup
    useEffect(() => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            addLog('Web Speech API not supported in this browser.', 'warning');
            showNotification('Voice input not supported in your browser.', 'warning');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            setIsListening(true);
            addLog('Speech recognition started.', 'info');
            showNotification('Listening for your voice...', 'info');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setUserInput(transcript);
            addLog(`Speech recognized: "${transcript}"`, 'info');

            if (awaitingVoiceCommand) {
                recognitionRef.current?.stop();
                setIsListening(false);
                setAwaitingVoiceCommand(false);
                processVoiceCommand(transcript);
            }
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
    }, [addLog, showNotification, awaitingVoiceCommand, processVoiceCommand]);

    // Load available voices for TTS
    useEffect(() => {
        const loadVoices = () => {
            if (!speechSynthRef.current) return;
            
            const voices = speechSynthRef.current.getVoices();
            if (voices.length > 0) {
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
                }
            }
        };

        if (speechSynthRef.current) {
            speechSynthRef.current.onvoiceschanged = loadVoices;
            loadVoices();
        }

        return () => {
            if (speechSynthRef.current && speechSynthRef.current.onvoiceschanged) {
                speechSynthRef.current.onvoiceschanged = null;
            }
        };
    }, [addLog]);

    // Handle user input submission
    const handleSendMessage = async (e) => {
        e.preventDefault();
        const trimmedInput = userInput.trim();
        if (!trimmedInput || isLoading) return;

        setIsLoading(true);
        setUserInput('');

        const newUserMessage = {
            sender: 'user',
            text: trimmedInput,
            localTimestamp: new Date().toISOString()
        };

        let updatedChat = [...chatHistory, newUserMessage];
        setChatHistory(updatedChat);
        
        scrollToBottom();

        let aiResponseContent = '';

        // Creator recognition logic
        if (trimmedInput.toLowerCase().includes('calvin') && !isCalvinRecognized) {
            setIsCalvinRecognized(true);
            setAwaitingPassword(true);
            aiResponseContent = "Hello, Calvin. I recognize your name. Please provide the password to unlock special functions.";
        } else if (awaitingPassword && trimmedInput === '1945') {
            setHiddenFunctionUnlocked(true);
            setAwaitingPassword(false);
            aiResponseContent = "Password accepted. Creator Mode unlocked. Welcome back, Calvin. What can I do for you?";
            showNotification('Creator Mode Unlocked!', 'success');
        } else if (awaitingPassword && trimmedInput !== '1945') {
            setAwaitingPassword(false);
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
            setAwaitingVoiceCommand(true);
            recognitionRef.current?.start();
            showNotification('Voice Command Mode: Listening...', 'info');
        }

        // Tool processing
        if (!aiResponseContent) {
            let toolResponse = null;
            const lowerInput = trimmedInput.toLowerCase();

            // Weather check
            const weatherMatch = lowerInput.match(/weather in (.+)|what's the weather like in (.+)|temperature in (.+)/);
            if (weatherMatch) {
                const location = weatherMatch[1] || weatherMatch[2] || weatherMatch[3];
                toolResponse = await getWeatherReport(location.trim());
            }

            // Calculation check
            if (!toolResponse) {
                toolResponse = performCalculationOrConversion(trimmedInput);
            }

            // Translation check
            const translateMatch = lowerInput.match(/translate "(.+)" to ([a-z]{2})|translate (.+) to ([a-z]{2})/);
            if (!toolResponse && translateMatch) {
                const textToTranslate = translateMatch[1] || translateMatch[3];
                const targetLanguage = translateMatch[2] || translateMatch[4];
                toolResponse = await performTranslation(textToTranslate.trim(), targetLanguage.trim());
            }

            // News check
            const newsMatch = lowerInput.match(/news about (.+)|top stories|latest news/);
            if (!toolResponse && newsMatch) {
                const topic = newsMatch[1] ? newsMatch[1].trim() : 'general';
                toolResponse = await getNewsHeadlines(topic);
            }

            // Social media check
            const socialMediaMatch = lowerInput.match(/search for (.+) on (instagram|facebook|x|social media)/);
            if (!toolResponse && socialMediaMatch) {
                const personName = socialMediaMatch[1].trim();
                toolResponse = await socialMediaSearch(personName);
            }

            // Internet search check
            const internetSearchMatch = lowerInput.match(/search (google|duckduckgo) for (.+)|what is the (.+)|who is (.+)|search for (.+)/);
            if (!toolResponse && internetSearchMatch) {
                const engine = internetSearchMatch[1] ? internetSearchMatch[1].toLowerCase() : 'google';
                const query = internetSearchMatch[2] || internetSearchMatch[3] || internetSearchMatch[4] || internetSearchMatch[5];
                if (query) {
                    toolResponse = await searchInternet(query.trim(), engine);
                }
            }

            if (toolResponse) {
                aiResponseContent = toolResponse;
            } else {
                aiResponseContent = await getAIResponse(trimmedInput);
            }
        }
        
        const newAIResponse = {
            sender: 'model',
            text: aiResponseContent,
            localTimestamp: new Date().toISOString()
        };

        const finalChat = [...updatedChat, newAIResponse];
        setChatHistory(finalChat);

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
    const handleClearChat = () => {
        if (window.confirm("Are you sure you want to clear all chat history? This action cannot be undone.")) {
            setChatHistory([]);
            showNotification('Chat history cleared!', 'success');
            addLog('Chat history cleared.', 'info');
        }
    };

    // --- UI Rendering ---
    return (
        <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 to-black text-gray-100 font-sans antialiased">
            {/* Notification Display */}
            {notification.message && (
                <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg z-50 transition-all duration-300 ease-out
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
                    <span className={`text-sm font-medium ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
                        {isOnline ? 'Online' : 'Offline'}
                    </span>
                    {hiddenFunctionUnlocked && (
                        <span className="text-sm font-medium text-purple-400">
                            Creator Mode Active
                        </span>
                    )}
                </div>
            </header>

            {/* Chat Area */}
            <main className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatHistory.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20">
                       <p className="text-lg">Start a conversation with A.N.Y.A.!</p>
                        <p className="text-sm">Created by Calvin.</p>
                    </div>
                ) : (
                    chatHistory.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`max-w-3/4 p-3 rounded-lg shadow-md break-words
                                ${msg.sender === 'user' ? 'bg-gray-700 text-gray-100' : 'bg-gray-800 text-gray-200'}
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
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
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
                        <div className="bg-gray-800 p-3 rounded-lg shadow-md">
                            <p className="text-sm font-semibold mb-1">A.N.Y.A.</p>
                            <div className="flex items-center">
                                <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                </div>
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
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