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
    
    // Creator Recognition & Hidden Function States
    const [isCalvinRecognized, setIsCalvinRecognized] = useState(false);
    const [awaitingPassword, setAwaitingPassword] = useState(false);
    const [hiddenFunctionUnlocked, setHiddenFunctionUnlocked] = useState(false);
    const [awaitingVoiceCommand, setAwaitingVoiceCommand] = useState(false);

    // Refs for UI elements and APIs
    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);
    const speechSynthRef = useRef(window.speechSynthesis);
    const selectedVoiceRef = useRef(null);
    
    // Gemini API configuration
    const apiKey = ""; // API key is provided by the runtime environment
    const modelName = "gemini-2.5-flash-preview-05-20";

    // --- Utility Functions ---

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
            // Keep only the last 50 logs
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
                addLog(`(Runtime) Re-selected voice: ${foundVoice.name} (${foundVoice.lang})`, 'info');
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

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voiceToUse;
        utterance.rate = 1;
        utterance.pitch = 1;

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
            const errorMessage = event.error || 'Unknown error during synthesis.';
            addLog(`Speech synthesis error: ${errorMessage}`, 'error');
            console.error('SpeechSynthesisUtterance.onerror event details:', event);
            showNotification(`Speech error: ${errorMessage}. Try refreshing the page.`, 'error');
        };

        try {
            speechSynthRef.current.speak(utterance);
        } catch (e) {
            addLog(`Error calling speechSynth.speak(): ${e.message}`, 'error');
            console.error('Error calling speechSynth.speak():', e);
            showNotification(`Failed to initiate speech: ${e.message}`, 'error');
        }
    }, [addLog, showNotification]);
    
    // Stops any ongoing speech synthesis
    const stopSpeaking = useCallback(() => {
        if (speechSynthRef.current && speechSynthRef.current.speaking) {
            speechSynthRef.current.cancel();
            setIsSpeaking(false);
            addLog('Speech stopped by user.', 'info');
        }
    }, [addLog]);

    // --- Local Tool Functions ---

    const getWeatherReport = useCallback(async (location) => {
        showNotification(`🌤️ Getting live weather for ${location}...`, 'info');
        addLog(`Weather request for: ${location}`, 'info');

        try {
            const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
            const geoResponse = await fetch(geocodingUrl);
            const geoData = await geoResponse.json();

            if (!geoResponse.ok || !geoData.results || geoData.results.length === 0) {
                addLog(`Geocoding failed for "${location}"`, 'warning');
                return `🤔 I couldn't find a location called "${location}". Please check the spelling.`;
            }

            const { latitude, longitude, name, country } = geoData.results[0];
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
                addLog(`Open-Meteo weather API error for ${name}`, 'error');
                return `I encountered an error while fetching weather data for ${name}.`;
            }
        } catch (error) {
            addLog(`Network error during weather API call: ${error.message}`, 'error');
            console.error("Weather API error:", error);
            return `I'm sorry, I couldn't fetch the weather data due to a network issue.`;
        }
    }, [showNotification, addLog]);

    const performCalculationOrConversion = useCallback((query) => {
        const lowerQuery = query.toLowerCase();
        const mathMatch = lowerQuery.match(/(?:what is|calculate)\s+([\d\s\+\-\*\/\(\)\.]+)/);
        if (mathMatch) {
            try {
                // Safely evaluate the math expression without using `eval`
                const mathExpression = mathMatch[1].replace(/x/g, '*').replace(/÷/g, '/');
                const safeEval = (expression) => {
                    // This is a simple and limited parser for demonstration.
                    // For a robust solution, a dedicated library would be better.
                    let result;
                    try {
                        result = new Function('return ' + expression)();
                    } catch (e) {
                        return null; // Indicate a failure
                    }
                    return result;
                };

                const result = safeEval(mathExpression);

                if (result !== null) {
                    addLog(`Calculation: "${mathExpression}" = ${result}`, 'info');
                    return `The result is: ${result}`;
                } else {
                    addLog(`Calculation error: "${mathExpression}" is not a valid expression.`, 'error');
                    return "I'm sorry, I couldn't perform that calculation. Please enter a valid mathematical expression.";
                }
            } catch (e) {
                addLog(`Calculation error: ${e.message}`, 'error');
                return "I'm sorry, I couldn't perform that calculation.";
            }
        }

        const convertMatch = lowerQuery.match(/convert\s+([\d.]+)\s*([a-z]+)\s+to\s+([a-z]+)|([\d.]+)\s*([a-z]+)\s+in\s+([a-z]+)/);
        if (convertMatch) {
            const value = parseFloat(convertMatch[1] || convertMatch[4]);
            const fromUnit = (convertMatch[2] || convertMatch[5])?.toLowerCase();
            const toUnit = (convertMatch[3] || convertMatch[6])?.toLowerCase();
            if (isNaN(value)) return null;
            const conversions = { 'km': { 'miles': 0.621371 }, 'miles': { 'km': 1.60934 } }; // Simplified for example
            if (conversions[fromUnit] && conversions[fromUnit][toUnit]) {
                const convertedValue = value * conversions[fromUnit][toUnit];
                addLog(`Conversion: ${value} ${fromUnit} to ${toUnit} = ${convertedValue}`, 'info');
                return `${value} ${fromUnit} is approximately ${convertedValue.toFixed(2)} ${toUnit}.`;
            }
        }
        return null;
    }, [addLog]);

    const performTranslation = useCallback(async (text, targetLang) => {
        showNotification(`Translating "${text}" to ${targetLang}...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 1500));
        const translatedText = `Real-time translation for "${text}" to ${targetLang} requires a backend service. I can't perform that directly.`;
        addLog(`Translation limitation: ${translatedText}`, 'info');
        return translatedText;
    }, [showNotification, addLog]);

    const getNewsHeadlines = useCallback(async (topic) => {
        showNotification(`📰 Fetching news about ${topic || 'general'}...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 2000));
        const newsReport = `To provide real-time news headlines, I would need access to a live news API. I cannot fetch that information directly.`;
        addLog(`News limitation: ${newsReport}`, 'info');
        return newsReport;
    }, [showNotification, addLog]);

    const searchInternet = useCallback(async (query, engine = 'google') => {
        showNotification(`🌐 Searching the internet for "${query}" using ${engine}...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return `(Mock Search) I found some general information about "${query}" using ${engine}. For example, Wikipedia has an article on it.`;
    }, [showNotification, addLog]);

    const socialMediaSearch = useCallback(async (personName) => {
        showNotification(`🕵️‍♀️ Searching social media for "${personName}"...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 2500));
        const result = `Due to privacy restrictions and API limitations, I cannot access real-time personal profiles on platforms.`;
        addLog(`Social media search limitation: ${result}`, 'info');
        return result;
    }, [showNotification, addLog]);

    const handleCopy = useCallback((text) => {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = 0;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showNotification('Copied to clipboard!', 'success', 1500);
            addLog(`Text copied to clipboard.`, 'info');
        } catch (err) {
            console.error('Failed to copy text:', err);
            showNotification('Failed to copy text. Please try manually.', 'error');
            addLog(`Failed to copy text: ${err.message}`, 'error');
        }
    }, [showNotification, addLog]);

    // --- Gemini API Function ---

    const getAIResponse = useCallback(async (history) => {
        addLog('Calling Gemini API for response.', 'info');
        setIsLoading(true);
        try {
            const chatHistoryForAPI = history.map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            }));
            
            const payload = {
                contents: chatHistoryForAPI,
                model: modelName,
            };

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                addLog(`Gemini API responded with: "${text.substring(0, 50)}..."`, 'success');
                return text;
            } else {
                addLog('Gemini API returned an empty or malformed response.', 'error');
                showNotification('Failed to get a response from the AI.', 'error');
                return "I'm sorry, I encountered an error while trying to get a response.";
            }

        } catch (error) {
            addLog(`Error from Gemini API: ${error.message}`, 'error');
            console.error('Gemini API Error:', error);
            showNotification('Failed to get a response from the AI. Check your network.', 'error');
            return "I'm sorry, I encountered an error while trying to get a response.";
        } finally {
            setIsLoading(false);
        }
    }, [addLog, showNotification, apiKey]);
    
    // --- Core Logic & Effects ---

    // Load chat history from local storage on component mount
    useEffect(() => {
        const savedChat = localStorage.getItem('chatHistory');
        if (savedChat) {
            try {
                setChatHistory(JSON.parse(savedChat));
            } catch (error) {
                addLog('Error parsing chat history from local storage.', 'error');
            }
        }
        scrollToBottom();
    }, [addLog]);

    // Set up Speech Recognition and Speech Synthesis voices on component mount
    useEffect(() => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            addLog('Web Speech API not supported in this browser.', 'warning');
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
            showNotification(`Voice input error: ${event.error}`, 'error');
        };

        recognition.onend = () => {
            if (!awaitingVoiceCommand) {
                setIsListening(false);
                addLog('Speech recognition ended.', 'info');
            }
        };

        recognitionRef.current = recognition;

        const loadVoices = () => {
            const voices = speechSynthRef.current.getVoices();
            if (voices.length > 0) {
                selectedVoiceRef.current = voices.find(v => v.lang === 'en-GB' && v.name.includes('Female')) || voices[0];
                addLog(`Default TTS voice selected: ${selectedVoiceRef.current.name}`, 'info');
            }
        };

        if (speechSynthRef.current.onvoiceschanged !== undefined) {
            speechSynthRef.current.onvoiceschanged = loadVoices;
        }
        loadVoices();

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [addLog, showNotification, awaitingVoiceCommand]);

    // Processes a voice command received after "Open Voice Command" activation.
    const processVoiceCommand = useCallback(async (commandText) => {
        addLog(`Processing voice command: "${commandText}"`, 'info');
        setIsLoading(true);
        setUserInput('');

        showNotification('Processing voice command...', 'info', 3000);
        await new Promise(resolve => setTimeout(resolve, 3000));

        await handleSendMessage(null, commandText); // Pass the command to the main handler
        setIsLoading(false);
    }, []);

    // Handle user input submission
    const handleSendMessage = useCallback(async (e, voiceCommand = null) => {
        if (e) e.preventDefault();
        const trimmedInput = voiceCommand || userInput.trim();
        if (!trimmedInput || isLoading) return;

        setIsLoading(true);
        if (!voiceCommand) setUserInput('');

        const newUserMessage = {
            sender: 'user',
            text: trimmedInput,
            localTimestamp: new Date().toISOString()
        };

        const updatedChat = [...chatHistory, newUserMessage];
        setChatHistory(updatedChat);
        localStorage.setItem('chatHistory', JSON.stringify(updatedChat));
        
        scrollToBottom();

        let aiResponseContent = '';

        // Creator Recognition & Special Functions
        if (trimmedInput.toLowerCase().includes('calvin') && !isCalvinRecognized) {
            setIsCalvinRecognized(true);
            setAwaitingPassword(true);
            aiResponseContent = "Hello, Calvin. I recognize your name. Please provide the password to unlock special functions.";
        } else if (awaitingPassword && trimmedInput === '1945') {
            setHiddenFunctionUnlocked(true);
            setAwaitingPassword(false);
            aiResponseContent = "Password accepted. Creator Mode unlocked. Welcome back, Calvin.";
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
            aiResponseContent = "Voice Command mode activated. I'm listening for your command.";
            setAwaitingVoiceCommand(true);
            recognitionRef.current?.start();
            showNotification('Voice Command Mode: Listening...', 'info');
        }

        // Local Tool-based Responses
        if (!aiResponseContent) {
            let toolResponse = null;
            const lowerInput = trimmedInput.toLowerCase();

            const weatherMatch = lowerInput.match(/weather in (.+)|what's the weather like in (.+)/);
            if (weatherMatch) {
                toolResponse = await getWeatherReport(weatherMatch[1] || weatherMatch[2]);
            } else if (lowerInput.startsWith('calculate') || lowerInput.includes('what is')) {
                toolResponse = performCalculationOrConversion(trimmedInput);
            } else if (lowerInput.startsWith('translate')) {
                 const translateMatch = lowerInput.match(/translate "(.+)" to ([a-z]{2})|translate (.+) to ([a-z]{2})/);
                 if (translateMatch) toolResponse = await performTranslation(translateMatch[1] || translateMatch[3], translateMatch[2] || translateMatch[4]);
            } else if (lowerInput.includes('news')) {
                const newsMatch = lowerInput.match(/news about (.+)/);
                toolResponse = await getNewsHeadlines(newsMatch ? newsMatch[1] : 'general');
            } else if (lowerInput.includes('social media')) {
                const socialMediaMatch = lowerInput.match(/search for (.+) on (instagram|facebook|x|social media)/);
                if (socialMediaMatch) toolResponse = await socialMediaSearch(socialMediaMatch[1]);
            } else if (lowerInput.includes('search')) {
                const internetSearchMatch = lowerInput.match(/search (google|duckduckgo) for (.+)|search for (.+)/);
                if (internetSearchMatch) toolResponse = await searchInternet(internetSearchMatch[2] || internetSearchMatch[3], internetSearchMatch[1]);
            }
            aiResponseContent = toolResponse;
        }

        // Fallback to Gemini API for general conversation
        if (!aiResponseContent) {
            aiResponseContent = await getAIResponse(updatedChat);
        }
        
        const newAIResponse = {
            sender: 'anya',
            text: aiResponseContent,
            localTimestamp: new Date().toISOString()
        };

        const finalChat = [...updatedChat, newAIResponse];
        setChatHistory(finalChat);
        localStorage.setItem('chatHistory', JSON.stringify(finalChat));

        speak(aiResponseContent);

        setIsLoading(false);
        scrollToBottom();
    }, [userInput, isLoading, chatHistory, isCalvinRecognized, awaitingPassword, hiddenFunctionUnlocked, awaitingVoiceCommand, addLog, showNotification, getWeatherReport, performCalculationOrConversion, performTranslation, getNewsHeadlines, socialMediaSearch, searchInternet, getAIResponse, speak, scrollToBottom]);

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
        if (window.confirm("Are you sure you want to clear all chat history?")) {
            localStorage.removeItem('chatHistory');
            setChatHistory([]);
            showNotification('Chat history cleared!', 'success');
            addLog('Chat history cleared from local storage.', 'info');
        }
    };

    const isOnline = true; // Hardcoded for this demo

    // --- UI Rendering ---
    return (
        <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 to-black text-gray-100 font-inter antialiased">
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
                body { font-family: 'Inter', sans-serif; }
                .chat-message-user {
                    background-color: #2d3748;
                    border-bottom-left-radius: 0.75rem;
                    border-top-left-radius: 0.75rem;
                    border-top-right-radius: 0.75rem;
                }
                .chat-message-anya {
                    background-color: #1a202c;
                    border-bottom-right-radius: 0.75rem;
                    border-top-left-radius: 0.75rem;
                    border-top-right-radius: 0.75rem;
                }
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                `}
            </style>

            {/* Notification Display */}
            {notification.message && (
                <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg z-50
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
                <p className="text-lg">V 1.3</p>
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

            {/* Main Chat & Logs Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Chat Area */}
                <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
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
                                    ${msg.sender === 'user' ? 'chat-message-user text-gray-100' : 'chat-message-anya text-gray-200'}
                                `}>
                                    <p className="text-sm font-semibold mb-1">
                                        {msg.sender === 'user' ? 'You' : 'A.N.Y.A.'}
                                    </p>
                                    <p className="text-base whitespace-pre-wrap">{msg.text}</p>
                                    <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
                                        <span>{new Date(msg.localTimestamp).toLocaleTimeString()}</span>
                                        {msg.sender === 'anya' && (
                                            <div className="flex space-x-1">
                                                <button
                                                    onClick={() => speak(msg.text)}
                                                    className="p-1 rounded hover:bg-gray-700 transition-colors"
                                                    title="Read Aloud"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M12 2A10 10 0 0 0 2 12A10 10 0 0 0 12 22A10 10 0 0 0 22 12A10 10 0 0 0 12 2M10 16.5V7.5L16 12L10 16.5Z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => handleCopy(msg.text)}
                                                    className="p-1 rounded hover:bg-gray-700 transition-colors"
                                                    title="Copy to clipboard"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M19 11a7 7 0 01-7 7h-1a1 1 0 010-2h1a5 5 0 005-5V9.414l-2.707 2.707a1 1 0 01-1.414-1.414l4.414-4.414a1 1 0 011.414 0l4.414 4.414a1 1 0 01-1.414 1.414L19 9.414V11zM7 7a7 7 0 017 7v1a1 1 0 010 2h-1a5 5 0 00-5-5v-1.414l2.707-2.707a1 1 0 011.414 1.414L7 9.414V7zM12 20v2m-4.707-3.293l-1.414 1.414M20.707 16.707l-1.414 1.414M3 11H1m22 0h-2" />
                                                    </svg>
                                                </button>
                                            </div>
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

                {/* Log & Debug Panel */}
                <div className="w-1/4 flex flex-col p-4 bg-gray-800 border-l border-gray-700 shadow-lg overflow-hidden">
                    <h2 className="text-lg font-semibold text-blue-400 mb-2">System Logs</h2>
                    <div className="flex-1 overflow-y-auto text-xs space-y-1 pr-2 scrollbar-hide">
                        {systemLogs.map((log, index) => (
                            <div key={index} className={`p-2 rounded-lg break-words
                                ${log.type === 'info' ? 'bg-gray-700 text-gray-300' :
                                log.type === 'success' ? 'bg-green-700 text-green-200' :
                                log.type === 'error' ? 'bg-red-700 text-red-200' :
                                log.type === 'warning' ? 'bg-yellow-700 text-yellow-200' : 'bg-gray-700 text-gray-300'}
                            `}>
                                <span className="font-mono">{log.timestamp.toLocaleTimeString()} - </span>
                                <span>{log.message}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

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
                    disabled={isLoading || isSpeaking}
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
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3.53-2.94 6.43-6.3 6.43S5.7 14.53 5.7 11H4c0 4.17 3.12 7.22 7 7.79V21h2v-2.21c3.88-.57 7-3.62 7-7.79h-1.7z" />
                        </svg>
                    </button>
                    {isSpeaking && (
                        <button
                            onClick={stopSpeaking}
                            className={`p-3 rounded-lg bg-yellow-600 hover:bg-yellow-700 transition-colors duration-200
                                ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                            disabled={isLoading}
                            title="Stop Speaking"
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                            </svg>
                        </button>
                    )}
                    <button
                        onClick={() => handleSendMessage()}
                        className={`p-3 rounded-lg bg-green-600 hover:bg-green-700 transition-colors duration-200
                            ${isLoading || !userInput.trim() ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        disabled={isLoading || !userInput.trim()}
                        title="Send Message"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
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
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                        </svg>
                    </button>
                </div>
            </footer>
        </div>
    );
};

export default ANYA;
