import React, { useState, useEffect, useRef } from "react";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { FaMicrophone, FaPaperPlane, FaLightbulb } from "react-icons/fa";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { ReactTyped } from "react-typed";
import axios from "axios";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import api, { getUser } from "../utils/auth";
// Helper function to parse message content
const MessageContent = ({ content }) => {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;

  // Split the content into text and code blocks
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: content.substring(lastIndex, match.index),
      });
    }

    // Add code block with language
    parts.push({
      type: "code",
      language: match[1] || "text",
      content: match[2].trim(),
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last code block
  if (lastIndex < content.length) {
    parts.push({
      type: "text",
      content: content.substring(lastIndex),
    });
  }

  // If no code blocks were found, treat the entire content as text
  if (parts.length === 0) {
    parts.push({
      type: "text",
      content: content,
    });
  }

  // Render each part
  return (
    <div className="message-content">
      {parts.map((part, index) => {
        if (part.type === "code") {
          return (
            <div key={index} className="my-4 rounded-md overflow-hidden">
              <div className="bg-gray-900 text-xs px-4 py-1 text-gray-400 flex justify-between items-center">
                <span>{part.language}</span>
                <button
                  className="hover:text-white transition-colors"
                  onClick={() => navigator.clipboard.writeText(part.content)}
                >
                  Copy
                </button>
              </div>
              <SyntaxHighlighter
                language={part.language}
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  borderRadius: "0 0 6px 6px",
                  fontSize: "0.9rem",
                }}
              >
                {part.content}
              </SyntaxHighlighter>
            </div>
          );
        } else {
          return (
            <div key={index} className="mb-2 whitespace-pre-wrap">
              {part.content.split("\n").map((line, i) => {
                // Process markdown-style bold text (**text**)
                const boldRegex = /\*\*(.*?)\*\*/g;
                let formattedLine = line;
                let boldMatch;
                let fragments = [];
                let lastBoldIndex = 0;

                while ((boldMatch = boldRegex.exec(line)) !== null) {
                  // Add text before bold
                  if (boldMatch.index > lastBoldIndex) {
                    fragments.push({
                      type: "normal",
                      content: line.substring(lastBoldIndex, boldMatch.index),
                    });
                  }

                  // Add bold text
                  fragments.push({
                    type: "bold",
                    content: boldMatch[1],
                  });

                  lastBoldIndex = boldMatch.index + boldMatch[0].length;
                }

                // Add remaining text after last bold
                if (lastBoldIndex < line.length) {
                  fragments.push({
                    type: "normal",
                    content: line.substring(lastBoldIndex),
                  });
                }

                // If no bold text was found, use the entire line
                if (fragments.length === 0) {
                  fragments.push({
                    type: "normal",
                    content: line,
                  });
                }

                return (
                  <div key={i}>
                    {fragments.map((fragment, j) =>
                      fragment.type === "bold" ? (
                        <strong key={j} className="font-bold">
                          {fragment.content}
                        </strong>
                      ) : (
                        <span key={j}>{fragment.content}</span>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          );
        }
      })}
    </div>
  );
};

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [user, setUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);

  const { transcript, resetTranscript } = useSpeechRecognition();

  const demoSuggestions = [
    "Explain binary search complexity",
    "How do I implement a bubble sort?",
    "What's the best way to solve this sorting problem?",
    "Help me understand merge sort",
  ];

  useEffect(() => {
    setInput(transcript);
  }, [transcript]);

  useEffect(() => {
    // Use the stored user from localStorage instead of making a separate API call
    const userData = getUser();
    if (userData) {
      setUser(userData);
    } else {
      // Fallback to API call if needed
      const fetchUser = async () => {
        try {
          const response = await api.get("/api/me");
          setUser(response.data);
        } catch (error) {
          console.error("Error fetching user data", error);
        }
      };
      fetchUser();
    }
  }, []);

  // to fetch chat history when user data is available
  useEffect(() => {
    const fetchChatHistory = async () => {
      if (user?.id) {
        try {
          const response = await api.get("/api/chats");

          // Transform the database chats to alternating user-bot messages
          const chatHistory = response.data.flatMap((chat) => [
            {
              text: chat.userMessage,
              sender: "user",
              chatId: chat._id,
              conversationId: chat.conversationId,
            },
            {
              text: chat.botMessage,
              sender: "bot",
              chatId: chat._id,
              conversationId: chat.conversationId,
            },
          ]);

          setMessages(chatHistory);
        } catch (error) {
          console.error("Error fetching chat history", error);
        }
      }
    };

    fetchChatHistory();
  }, [user?.id]);

  const handleMicClick = () => {
    if (isListening) {
      SpeechRecognition.stopListening();
      setIsListening(false);
    } else {
      SpeechRecognition.startListening({});
      setIsListening(true);
    }
  };

  const sendMessage = async () => {
    if (input.trim()) {
      // If we're editing, use the existing conversationId
      const conversationId =
        editingId !== null
          ? messages[editingId].conversationId
          : Date.now().toString();

      // Use editText if we're editing, otherwise use input
      const messageToSend = editingId !== null ? editText : input;

      const newMessage = {
        text: messageToSend,
        sender: "user",
        conversationId,
        isLocal: true,
      };
      console.log(newMessage);

      // If editing, replace the message and remove all subsequent messages from UI
      if (editingId !== null) {
        // Keep messages only up to the edited message and replace it
        setMessages((prev) => {
          const updated = prev.slice(0, editingId);
          updated.push(newMessage);
          return updated;
        });
      } else {
        setMessages((prev) => [...prev, newMessage]);
      }

      setInput("");
      resetTranscript();
      setIsTyping(true);

      try {
        // You might want to unify these or use an environment variable
        const response = await api.post("https://35.193.112.172.sslip.io/chat", {
          message: messageToSend,
          conversationId,
        });

        // If we were editing, also update the database
        if (editingId !== null) {
          try {
            await api.put(`/api/chat/${messages[editingId].chatId}`, {
              userMessage: messageToSend,
              botMessage: response.data.response,
              conversationId,
            });
          } catch (error) {
            console.error("Error updating edit on server:", error);
          }
        } else {
          // Save to database (for new messages)
          await api.post("/api/chat", {
            userMessage: messageToSend,
            botMessage: response.data.response,
            userId: user?.id,
            conversationId,
          });
        }

        // Update state with bot response
        setMessages((prev) => {
          const updated = [...prev];
          // Add bot response
          updated.push({
            text: response.data.response,
            sender: "bot",
            chatId: editingId !== null ? messages[editingId].chatId : null,
            conversationId,
          });
          return updated;
        });

        setIsTyping(false);
        setEditingId(null); // Reset editing state
        setEditText(""); // Reset edit text
      } catch (error) {
        console.error("Error sending message", error);
        setIsTyping(false);
        // Revert if error occurs
        if (editingId !== null) {
          setMessages(messages);
        } else {
          setMessages((prev) => prev.filter((msg) => !msg.isLocal));
        }
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (!SpeechRecognition.browserSupportsSpeechRecognition()) {
    return <div>Your browser does not support speech recognition.</div>;
  }

  const handleSuggestionClick = (suggestion) => {
    setInput(suggestion);
    setShowSuggestions(false);
    inputRef.current.focus();
  };

  // Animation variants
  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  // Function to handle message deletion
  const handleDelete = async (index) => {
    const message = messages[index];

    // For local unsaved messages, just remove from state
    if (message.isLocal) {
      setMessages((prev) => prev.filter((_, i) => i !== index));
      return;
    }

    if (message.sender !== "user" || !message.chatId) {
      console.error("Cannot delete this message");
      return;
    }

    try {
      await api.delete(`/api/chat/${message.chatId}`);

      // Delete both user message and corresponding bot message
      setMessages((prev) => {
        const newMessages = [...prev];
        // Find the bot response (next message with same chatId)
        const botResponseIndex = newMessages.findIndex(
          (m, i) => i > index && m.chatId === message.chatId
        );

        if (botResponseIndex !== -1) {
          newMessages.splice(botResponseIndex, 1);
        }
        newMessages.splice(index, 1);
        return newMessages;
      });
    } catch (error) {
      console.error("Delete failed:", error.response?.data || error.message);
      alert("Failed to delete message. Please try again.");
    }
  };

  // Function to start editing a message
  const startEditing = (index) => {
    if (messages[index].sender !== "user") return;
    setEditingId(index);
    setEditText(messages[index].text);
    setInput(messages[index].text); // Set input field to the current message text
  };

  // Function to save edited message
  const saveEdit = async () => {
    if (editingId === null) return;

    if (!editText.trim()) {
      setEditingId(null);
      return;
    }

    // Update the input field with the edited text
    setInput(editText);

    // Call sendMessage which will handle the edited message flow
    sendMessage();
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute opacity-5 top-0 left-0 w-full h-full">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern
                id="grid"
                width="50"
                height="50"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 50 0 L 0 0 0 50"
                  fill="none"
                  stroke="white"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {[...Array(12)].map((_, index) => (
          <motion.div
            key={index}
            className="absolute text-teal-500 opacity-20 text-sm"
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            animate={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
              rotate: Math.random() * 360,
              opacity: [0.1, 0.2, 0.1],
            }}
            transition={{
              duration: 15 + Math.random() * 20,
              repeat: Infinity,
              repeatType: "reverse",
            }}
          >
            {
              [
                "O(n)",
                "O(log n)",
                "O(n²)",
                "{}",
                "[]",
                "→",
                "∑",
                "⊃",
                "∪",
                "∩",
              ][Math.floor(Math.random() * 10)]
            }
          </motion.div>
        ))}
      </div>

      {/* Header */}
      <motion.header
        className="bg-gray-800 bg-opacity-80 backdrop-blur-sm p-4 flex justify-between items-center border-b border-gray-700 shadow-lg z-10"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div className="flex items-center" whileHover={{ scale: 1.05 }}>
          <motion.img
            src="page-photos/robot-2.png"
            alt="Bot"
            className="w-10 h-10 mr-2"
            animate={{
              rotate: [0, 10, 0, -10, 0],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              repeatType: "loop",
              ease: "easeInOut",
              times: [0, 0.2, 0.5, 0.8, 1],
            }}
          />
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-blue-500">
            DSA-GPT
          </h1>
        </motion.div>
        <div className="flex items-center">
          <motion.button
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md mr-2 flex items-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => (window.location.href = "/")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-1"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
            Home
          </motion.button>
         
        </div>
      </motion.header>

      {/* Main Content */}
      <div
        ref={chatContainerRef}
        className="flex-1 flex flex-col items-center relative overflow-y-auto p-4 pb-24"
      >
        {messages.length === 0 ? (
          <motion.div
            className="text-center mb-8 max-w-2xl"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
          >
            <motion.h2
              className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500"
              variants={fadeInUp}
            >
              DSA GPT - Your Algorithm Coach
            </motion.h2>
            <motion.div
              className="my-8"
              variants={fadeInUp}
              whileHover={{ scale: 1.05, rotate: [0, -5, 5, -5, 0] }}
              transition={{ duration: 0.5 }}
            >
              <div className="relative">
                <motion.div
                  className="absolute -inset-4 bg-teal-500 rounded-full opacity-20 blur-xl"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    repeatType: "reverse",
                  }}
                />
                <img
                  src="page-photos/robott.png"
                  alt="GPT Bot"
                  className="w-32 h-32 mx-auto relative z-10"
                />
              </div>
            </motion.div>
            <motion.p
              className="text-gray-300 text-xl mb-6"
              variants={fadeInUp}
            >
              I'm here to help you master Data Structures & Algorithms!
            </motion.p>
            <motion.div variants={fadeInUp}>
              <ReactTyped
                strings={[
                  "Ask me about binary search...",
                  "Need help with linked lists?",
                  "Want to understand Big O notation?",
                  "Struggling with dynamic programming?",
                  "Let's solve algorithm problems together!",
                ]}
                typeSpeed={40}
                backSpeed={30}
                loop
                className="text-teal-300 text-lg block mb-8"
              />
            </motion.div>
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mx-auto"
              variants={fadeInUp}
            >
              {demoSuggestions.map((suggestion, index) => (
                <motion.div
                  key={index}
                  whileHover={{
                    scale: 1.03,
                    backgroundColor: "rgba(20, 184, 166, 0.2)",
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-gray-800 p-4 rounded-lg border border-gray-700 cursor-pointer hover:border-teal-500 transition-all duration-300"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <div className="flex items-center">
                    <FaLightbulb className="text-teal-400 mr-2" />
                    <span>{suggestion}</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            className="w-full max-w-4xl"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
          >
            <AnimatePresence>
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  className={`my-4 flex group ${
                    message.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {message.sender === "bot" && (
                    <motion.div
                      className="h-8 w-8 rounded-full bg-teal-500 flex items-center justify-center mr-2 mt-1"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1, rotate: [0, 10, 0] }}
                      transition={{ duration: 0.3 }}
                    >
                      <img
                        src="page-photos/robot-2.png"
                        alt="Bot"
                        className="h-6 w-6"
                      />
                    </motion.div>
                  )}
                  <motion.div
                    className={`p-4 max-w-lg rounded-2xl shadow-lg relative ${
                      message.sender === "user"
                        ? "bg-gradient-to-r from-teal-600 to-teal-500 text-white rounded-tr-none"
                        : "bg-gray-800 border border-gray-700 text-white rounded-tl-none"
                    }`}
                    whileHover={{ scale: 1.01 }}
                    style={{ wordWrap: "break-word" }}
                  >
                    {editingId === index ? (
                      <div className="flex flex-col">
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="bg-gray-700 text-white p-2 rounded mb-2"
                          autoFocus
                        />
                        <div className="flex justify-end space-x-2">
                          <motion.button
                            onClick={saveEdit}
                            className="px-3 py-1 bg-teal-500 rounded-md"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Save & Resend
                          </motion.button>
                          <motion.button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1 bg-gray-600 rounded-md"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Cancel
                          </motion.button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {message.sender === "user" ? (
                          message.text
                        ) : (
                          <MessageContent content={message.text} />
                        )}
                        {message.sender === "user" && (
                          <div className="absolute -top-2 -right-2 flex space-x-1 opacity-100 group-hover:opacity-100 transition-opacity">
                            <motion.button
                              onClick={() => startEditing(index)}
                              className="p-1 bg-blue-500 rounded-full"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <FiEdit2 size={14} />
                            </motion.button>
                            <motion.button
                              onClick={() => handleDelete(index)}
                              className="p-1 bg-red-500 rounded-full"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <FiTrash2 size={14} />
                            </motion.button>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                  {message.sender === "user" && (
                    <motion.div
                      className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center ml-2 mt-1"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 text-white"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {isTyping && (
              <motion.div
                className="flex justify-start my-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div className="h-8 w-8 rounded-full bg-teal-500 flex items-center justify-center mr-2 mt-1">
                  <img
                    src="page-photos/robot-2.png"
                    alt="Bot"
                    className="h-6 w-6"
                  />
                </motion.div>
                <motion.div className="p-4 rounded-2xl bg-gray-800 border border-gray-700 text-white rounded-tl-none">
                  <motion.div
                    className="flex space-x-1"
                    animate={{ y: [0, -5, 0] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.5,
                      times: [0, 0.5, 1],
                      staggerChildren: 0.2,
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-2 h-2 bg-teal-400 rounded-full"
                        animate={{ y: [0, -5, 0] }}
                        transition={{
                          duration: 0.5,
                          repeat: Infinity,
                          delay: i * 0.2,
                        }}
                      />
                    ))}
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </motion.div>
        )}
      </div>

      {/* Bottom action bar */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-900 to-transparent pt-16"
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <div className="flex justify-center">
          <div className="w-full max-w-4xl relative">
            <div className="relative">
              <motion.input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full p-4 pr-24 bg-gray-800 border border-gray-700 rounded-full text-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500 focus:ring-opacity-50 transition-all duration-300"
                placeholder="Ask about DSA concepts, problems, or solutions..."
                whileFocus={{ scale: 1.01 }}
                layoutId="input-field"
              />
              <div className="absolute right-3 top-2 flex">
                <motion.button
                  onClick={handleMicClick}
                  className={`p-2 rounded-full mr-1 ${
                    isListening ? "bg-red-500" : "bg-gray-700 hover:bg-gray-600"
                  }`}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <FaMicrophone />
                </motion.button>
                <motion.button
                  onClick={sendMessage}
                  className="p-2 bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-600 hover:to-teal-500 rounded-full shadow-lg"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <FaPaperPlane />
                </motion.button>
              </div>
            </div>
          </div>
        </div>
        <motion.div
          className="text-center text-gray-500 text-xs mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 1 }}
        >
          DSA-GPT • Your algorithmic thinking partner • Learn patterns, not just
          solutions
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Chat;
