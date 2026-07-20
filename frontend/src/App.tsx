import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Heart, Pencil, Image as ImageIcon, ArrowLeft, Loader2, Camera, Download, RotateCcw, Scale, Gavel, Timer, Trophy, HelpCircle, MonitorPlay, Map, MonitorUp, Mic, MicOff, Video, VideoOff, MessageCircle, Send, X, Eraser, Trash2 } from 'lucide-react';

type ViewState = 'HOME' | 'HOST_LOBBY' | 'JOIN_LOBBY' | 'HUB' | 'DRAWING' | 'PHOTO_BOOTH' | 'DEBATE' | 'QUIZ' | 'WATCH_TOGETHER';

export default function App() {
    // --- Application State ---
    const [view, setView] = useState<ViewState>('HOME');
    const [roomCode, setRoomCode] = useState('');
    const [joinInput, setJoinInput] = useState('');
    const [lastEvent, setLastEvent] = useState<any>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [legalModal, setLegalModal] = useState<'NONE' | 'PRIVACY' | 'TERMS'>('NONE');
    const [partnerConnected, setPartnerConnected] = useState(false);
    const [disconnectWarning, setDisconnectWarning] = useState('');
    
    // Vercel-friendly Browser Timers
    const partnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const expireTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Persistent IDs & Room Memory
    const [myId] = useState(() => localStorage.getItem('sync_userId') || Math.random().toString(36).substring(2, 9));
    const [lastRoomCode, setLastRoomCode] = useState(() => localStorage.getItem('sync_roomCode') || '');
    
    // Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const isChatOpenRef = useRef(isChatOpen);

    useEffect(() => {
        localStorage.setItem('sync_userId', myId);
    }, [myId]);

    useEffect(() => {
        isChatOpenRef.current = isChatOpen;
        if (isChatOpen) setUnreadCount(0);
    }, [isChatOpen]);
    
    const [networkMode] = useState<'demo' | 'server'>('server');
    const channelRef = useRef<BroadcastChannel | null>(null);
    const socketRef = useRef<Socket | null>(null);

    const stateRef = useRef({ view, roomCode, joinInput });
    useEffect(() => {
        stateRef.current = { view, roomCode, joinInput };
    }, [view, roomCode, joinInput]);

    // --- Network & WebSocket Initialization ---
    useEffect(() => {
        if (networkMode === 'demo') {
            const channel = new BroadcastChannel('sync-app-demo');
            channelRef.current = channel;

            channel.onmessage = (e) => {
                const { type, payload } = e.data;
                const state = stateRef.current;

                if (type === 'JOIN_REQUEST' && state.view === 'HOST_LOBBY' && payload.code === state.roomCode) {
                    channel.postMessage({ type: 'ROOM_READY', payload: { code: state.roomCode } });
                    setView('HUB'); // Start as offline until ping returns
                } else if (type === 'ROOM_READY' && state.view === 'JOIN_LOBBY' && payload.code === state.joinInput) {
                    setView('HUB'); // Start as offline until ping returns
                } else if (type === 'GAME_EVENT') {
                    if (payload?.activity === 'sync-screen') {
                        setView(payload.screen);
                    } else if (payload?.activity === 'draw') {
                        // FAST LANE: Dispatch drawing directly to bypass React state
                        window.dispatchEvent(new CustomEvent('sync-draw-event', { detail: payload }));
                    } else {
                        setLastEvent(payload);
                    }
                } else if (type === 'PEER_DISCONNECT') {
                    handlePartnerDrop();
                } else if (type === 'CHAT_MESSAGE') {
                    setChatMessages(prev => [...prev, payload]);
                    if (!isChatOpenRef.current) setUnreadCount(prev => prev + 1);
                }
            };
            return () => channel.close();
        } else {
            // Socket Connection
            const socket = io('https://sync-backend-63p7.onrender.com');
            socketRef.current = socket;

            socket.on('room-created', (code) => {
                setRoomCode(code);
                setView('HOST_LOBBY');
            });
            socket.on('room-ready', () => {
                setView('HUB'); // Start as offline until ping returns
            });
            socket.on('game-event', (event) => {
                // Bypass React state batching for high-frequency WebRTC signals to prevent drops
                if (event.activity && event.activity.startsWith('webrtc')) {
                    window.dispatchEvent(new CustomEvent('sync-game-event', { detail: event }));
                    return;
                }
                
                // FAST LANE: Bypass React state batching for drawing to prevent cut lines
                if (event.activity === 'draw') {
                    window.dispatchEvent(new CustomEvent('sync-draw-event', { detail: event }));
                    return;
                }
                
                // Auto-Sync Screens
                if (event.activity === 'sync-screen') {
                    setView(event.screen);
                    return;
                }

                setLastEvent(event);
            });
            socket.on('error', (msg) => {
                setErrorMsg(msg);
                setTimeout(() => setErrorMsg(''), 3000);
            });
            socket.on('peer-disconnected', () => {
                handlePartnerDrop();
            });

            // Chat Events (Database Powered)
            socket.on('chat-history', (history) => {
                setChatMessages(history);
            });
            socket.on('receive-chat', (msg) => {
                setChatMessages(prev => [...prev, msg]);
                if (!isChatOpenRef.current) setUnreadCount(prev => prev + 1);
            });

            return () => { socket.close(); };
        }
    }, [networkMode]);

    // Save the room code to memory whenever we successfully enter the Hub
    useEffect(() => {
        const activeCode = roomCode || joinInput;
        if (activeCode && view === 'HUB') {
            localStorage.setItem('sync_roomCode', activeCode);
            setLastRoomCode(activeCode);
            startTimers(); // Start watching for partner presence when we join
        }
    }, [view, roomCode, joinInput]);

    // Continuous Ping (Heartbeat) to keep connection alive & verify presence
    useEffect(() => {
        if (view !== 'HOME' && view !== 'HOST_LOBBY' && view !== 'JOIN_LOBBY') {
            const sendPing = () => {
                const code = stateRef.current.roomCode || stateRef.current.joinInput;
                if (networkMode === 'demo') {
                    channelRef.current?.postMessage({ type: 'GAME_EVENT', payload: { activity: 'ping' } });
                } else {
                    socketRef.current?.emit('game-event', { code, event: { activity: 'ping' } });
                }
            };
            
            sendPing(); // Initial ping
            const pingInterval = setInterval(sendPing, 10000); // Ping every 10 seconds
            
            return () => clearInterval(pingInterval);
        }
    }, [view, networkMode]);

    // Helper to start the two-stage disconnect/expire timers
    const startTimers = () => {
        if (partnerTimeoutRef.current) clearTimeout(partnerTimeoutRef.current);
        if (expireTimeoutRef.current) clearTimeout(expireTimeoutRef.current);
        
        // Stage 1: Warning after 30 seconds of silence
        partnerTimeoutRef.current = setTimeout(() => {
            handlePartnerDrop();
        }, 30000); 
    };

    // What happens when partner drops (either directly or via 30s timeout)
    const handlePartnerDrop = () => {
        setPartnerConnected(false);
        setDisconnectWarning("Your partner got disconnected.");
        setTimeout(() => setDisconnectWarning(''), 5000);
        
        if (partnerTimeoutRef.current) clearTimeout(partnerTimeoutRef.current);
        if (expireTimeoutRef.current) clearTimeout(expireTimeoutRef.current);

        // Stage 2: Expire Room completely after 30 MORE seconds (60 seconds total)
        expireTimeoutRef.current = setTimeout(() => {
            setView('HOME');
            setRoomCode('');
            setJoinInput('');
            localStorage.removeItem('sync_roomCode');
            setLastRoomCode('');
            setDisconnectWarning("Room expired. Partner didn't reconnect in time.");
            setTimeout(() => setDisconnectWarning(''), 5000);
        }, 30000);
    };

    // Reset timers whenever we hear ANY event from partner
    useEffect(() => {
        if (lastEvent) {
            setPartnerConnected(true);
            
            if (lastEvent.activity === 'ping') {
                const code = stateRef.current.roomCode || stateRef.current.joinInput;
                if (networkMode === 'demo') {
                    channelRef.current?.postMessage({ type: 'GAME_EVENT', payload: { activity: 'pong' } });
                } else {
                    socketRef.current?.emit('game-event', { code, event: { activity: 'pong' } });
                }
            }

            // Acknowledge presence and reset the doom clocks
            startTimers();
        }
    }, [lastEvent, networkMode]);

    // Clean up timeouts when component unmounts
    useEffect(() => {
        return () => {
            if (partnerTimeoutRef.current) clearTimeout(partnerTimeoutRef.current);
            if (expireTimeoutRef.current) clearTimeout(expireTimeoutRef.current);
        };
    }, []);

    const createRoom = () => {
        if (networkMode === 'demo') {
            const code = Math.random().toString(36).substring(2, 7).toUpperCase();
            setRoomCode(code);
            setView('HOST_LOBBY');
        } else {
            socketRef.current?.emit('create-room');
        }
    };

    const joinRoom = () => {
        if (joinInput.length !== 5) return;
        if (networkMode === 'demo') {
            channelRef.current?.postMessage({ type: 'JOIN_REQUEST', payload: { code: joinInput } });
        } else {
            socketRef.current?.emit('join-room', joinInput);
        }
    };

    const sendGameEvent = (event: any) => {
        if (networkMode === 'demo') {
            channelRef.current?.postMessage({ type: 'GAME_EVENT', payload: event });
        } else {
            socketRef.current?.emit('game-event', { code: roomCode || joinInput, event });
        }
    };

    const handleSyncScreen = (screen: ViewState) => {
        sendGameEvent({ activity: 'sync-screen', screen });
        setView(screen);
    };

    const sendChatMessage = (text: string) => {
        const msg = { code: roomCode || joinInput, senderId: myId, text, timestamp: new Date() };
        if (networkMode === 'demo') {
            channelRef.current?.postMessage({ type: 'CHAT_MESSAGE', payload: msg });
            setChatMessages(prev => [...prev, msg]); 
        } else {
            socketRef.current?.emit('send-chat', msg);
        }
    };

    const renderHome = () => (
        <div className="absolute inset-0 bg-white flex flex-col items-center w-full z-10 overflow-y-auto">
            <div className="flex flex-col min-h-full max-w-md mx-auto w-full px-6">
                <div className="flex-1 flex flex-col items-center justify-center w-full py-10 mt-12">
                    
                    <div className="flex flex-col items-center justify-center mb-16">
                        {/* Custom Double Heart Logo */}
                        <svg viewBox="0 0 100 100" className="w-32 h-32" fill="none" xmlns="http://www.w3.org/2000/svg">
                            {/* Outer swooping stroke */}
                            <path d="M50 85 C 10 55, 5 25, 25 10 C 38 0, 48 10, 50 20 C 52 10, 62 0, 75 10 C 95 25, 90 55, 50 85 Z" stroke="#FF1010" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                            {/* Inner swooping stroke */}
                            <path d="M50 75 C 20 50, 15 30, 28 18 C 38 10, 46 16, 50 26 C 54 16, 62 10, 72 18 C 85 30, 80 50, 50 75 Z" stroke="#FF1010" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <h1 className="text-5xl font-serif italic text-gray-900 mt-2 tracking-tight">Sync</h1>
                    </div>

                    <p className="text-gray-500 mb-10 text-lg text-center font-medium">Fun dates & activities for long distance relationships.</p>

                    <div className="w-full space-y-4">
                        {lastRoomCode && (
                            <button 
                                onClick={() => {
                                    setJoinInput(lastRoomCode);
                                    if (networkMode === 'demo') {
                                        channelRef.current?.postMessage({ type: 'JOIN_REQUEST', payload: { code: lastRoomCode } });
                                    } else {
                                        socketRef.current?.emit('join-room', lastRoomCode);
                                    }
                                }} 
                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl py-4 font-bold text-lg transition-all active:scale-[0.98] shadow-lg shadow-emerald-200"
                            >
                                Reconnect to {lastRoomCode}
                            </button>
                        )}
                        <button onClick={createRoom} className="w-full bg-rose-500 hover:bg-rose-600 text-white rounded-2xl py-4 font-bold text-lg transition-all active:scale-[0.98] shadow-lg shadow-rose-200">
                            Create a Date
                        </button>
                        <button onClick={() => setView('JOIN_LOBBY')} className="w-full bg-white border-2 border-rose-100 text-rose-600 hover:bg-rose-50 rounded-2xl py-4 font-bold text-lg transition-all active:scale-[0.98]">
                            Join with Code
                        </button>
                    </div>
                </div>
                
                <footer className="w-full py-6 mt-auto text-center border-t border-gray-100">
                    <p className="text-xs text-gray-400 font-medium mb-2">
                        &copy; 2026 Mark Joseph Guirren. All rights reserved.
                    </p>
                    <div className="flex justify-center items-center gap-4 text-xs text-gray-400">
                        <button onClick={() => setLegalModal('PRIVACY')} className="hover:text-gray-600 transition-colors">Privacy Policy</button>
                        <span>&middot;</span>
                        <button onClick={() => setLegalModal('TERMS')} className="hover:text-gray-600 transition-colors">Terms of Service</button>
                    </div>
                </footer>
            </div>
        </div>
    );

    const renderLegalModal = () => {
        if (legalModal === 'NONE') return null;
        
        const isPrivacy = legalModal === 'PRIVACY';
        const title = isPrivacy ? "Privacy Policy" : "Terms of Service";
        
        return (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-lg max-h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                    </div>
                    <div className="p-6 overflow-y-auto flex-1 text-sm text-gray-600 space-y-4">
                        {isPrivacy ? (
                            <>
                                <p><strong>Last Updated:</strong> July 2026</p>
                                <p>Welcome to Sync. Your privacy is critically important to us. This policy outlines how we handle your data.</p>
                                <h3 className="font-bold text-gray-800 text-base mt-4">1. Data Collection</h3>
                                <p>Sync is designed to be ephemeral. We do not store your drawings, photos, or video streams on our servers. Text chat messages are securely encrypted and stored solely to allow offline messaging between you and your partner.</p>
                                <h3 className="font-bold text-gray-800 text-base mt-4">2. WebRTC and Camera Access</h3>
                                <p>To use the Watch Together and Photo Booth features, the app requests access to your camera and microphone. This stream is transmitted directly to your partner's device via peer-to-peer connection and is never recorded or intercepted by our servers.</p>
                                <h3 className="font-bold text-gray-800 text-base mt-4">3. Local Storage</h3>
                                <p>Downloaded photos and game results are saved directly to your local device. A small anonymous identifier is stored in your browser to maintain your chat identity.</p>
                            </>
                        ) : (
                            <>
                                <p><strong>Last Updated:</strong> July 2026</p>
                                <p>By using Sync, you agree to these Terms of Service. Please read them carefully.</p>
                                <h3 className="font-bold text-gray-800 text-base mt-4">1. Acceptable Use</h3>
                                <p>Sync is built for fun, connection, and long-distance dates. You agree not to use the service for any illegal, harmful, or abusive activities.</p>
                                <h3 className="font-bold text-gray-800 text-base mt-4">2. Provided "As Is"</h3>
                                <p>This application is provided "as is" without any warranties. We are not responsible for dropped connections, lost drawings, or interrupted movie streams.</p>
                                <h3 className="font-bold text-gray-800 text-base mt-4">3. User Content</h3>
                                <p>You are solely responsible for the content you stream, draw, or chat over the platform. Because video connections are peer-to-peer, we cannot and do not moderate user behavior.</p>
                            </>
                        )}
                    </div>
                    <div className="p-4 border-t border-gray-100 bg-gray-50 text-center">
                        <button onClick={() => setLegalModal('NONE')} className="w-full bg-rose-500 hover:bg-rose-600 text-white rounded-xl py-3 font-bold transition-all active:scale-[0.98]">
                            I Understand
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderHostLobby = () => (
        <div className="flex flex-col items-center justify-center min-h-[80vh] w-full max-w-md mx-auto text-center px-6">
            <button onClick={() => { setView('HOME'); setRoomCode(''); }} className="absolute top-6 left-6 p-3 bg-white text-gray-500 rounded-full shadow-sm hover:bg-gray-50">
                <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Your Room Code</h2>
            <div className="text-5xl tracking-[0.25em] font-mono font-black text-rose-500 mb-10 bg-rose-50 py-8 px-4 rounded-3xl border border-rose-100 w-full shadow-inner">
                {roomCode}
            </div>
            <div className="flex items-center text-gray-500 gap-3 font-medium bg-white px-6 py-3 rounded-full shadow-sm border border-gray-100">
                <Loader2 className="w-5 h-5 animate-spin text-rose-400" />
                Waiting for partner to join...
            </div>
        </div>
    );

    const renderJoinLobby = () => (
        <div className="flex flex-col items-center justify-center min-h-[80vh] w-full max-w-md mx-auto text-center px-6">
            <button onClick={() => setView('HOME')} className="absolute top-6 left-6 p-3 bg-white text-gray-500 rounded-full shadow-sm hover:bg-gray-50">
                <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Enter Date Code</h2>
            <input
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase().slice(0, 5))}
                className="text-4xl tracking-[0.25em] font-mono font-black text-center w-full bg-white border-2 border-rose-100 py-8 rounded-3xl mb-8 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 transition-all uppercase shadow-sm"
                placeholder="XXXXX"
                autoFocus
            />
            {errorMsg && <p className="text-red-500 font-medium mb-4">{errorMsg}</p>}
            <button 
                onClick={joinRoom}
                disabled={joinInput.length !== 5}
                className="w-full bg-rose-500 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-2xl py-4 font-bold text-lg transition-all active:scale-[0.98] shadow-lg shadow-rose-200 disabled:shadow-none"
            >
                Join Date
            </button>
        </div>
    );

    const renderHub = () => (
        <div className="p-6 max-w-md mx-auto w-full min-h-[80vh]">
            <div className="flex items-center justify-between mb-8 mt-4 bg-white p-4 rounded-2xl shadow-sm border border-rose-50">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Activities Hub</h2>
                    <p className="text-sm text-gray-500">Room: <span className="font-mono font-bold text-rose-500">{roomCode || joinInput}</span></p>
                </div>
                <span className={`px-3 py-1.5 text-xs font-bold rounded-full flex items-center gap-2 border ${partnerConnected ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                    <div className={`w-2 h-2 rounded-full ${partnerConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                    {partnerConnected ? 'Connected' : 'Offline'}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handleSyncScreen('DRAWING')} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-rose-100 group relative overflow-hidden text-center">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shrink-0">
                        <Pencil className="text-rose-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-800 text-sm mb-1">Draw Together</span>
                    <span className="text-[11px] text-gray-500 leading-snug">Share a live canvas and doodle together.</span>
                </button>

                <button onClick={() => handleSyncScreen('PHOTO_BOOTH')} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-rose-100 group relative overflow-hidden text-center">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shrink-0">
                        <ImageIcon className="text-rose-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-800 text-sm mb-1">Photo Booth</span>
                    <span className="text-[11px] text-gray-500 leading-snug">Pose and snap 4 synced photos together.</span>
                </button>

                <button onClick={() => handleSyncScreen('DEBATE')} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-rose-100 group relative overflow-hidden text-center">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shrink-0">
                        <Scale className="text-rose-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-800 text-sm mb-1">Debate Court</span>
                    <span className="text-[11px] text-gray-500 leading-snug">Argue a topic. Let an AI judge decide who wins.</span>
                </button>

                <button onClick={() => handleSyncScreen('QUIZ')} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-rose-100 group relative overflow-hidden text-center">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shrink-0">
                        <HelpCircle className="text-rose-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-800 text-sm mb-1">Couple's Quiz</span>
                    <span className="text-[11px] text-gray-500 leading-snug">Answer secretly, then reveal to see if you match!</span>
                </button>

                <button onClick={() => handleSyncScreen('WATCH_TOGETHER')} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-rose-100 group relative overflow-hidden text-center col-span-2 sm:col-span-1">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shrink-0">
                        <MonitorPlay className="text-rose-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-800 text-sm mb-1">Watch Together</span>
                    <span className="text-[11px] text-gray-500 leading-snug">Screen share and video chat live.</span>
                </button>

                <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-3xl border border-gray-100 opacity-60 text-center col-span-2 sm:col-span-1">
                    <div className="w-12 h-12 bg-gray-200 rounded-2xl flex items-center justify-center mb-3">
                        <Map className="text-gray-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-600 text-sm">Snap Hunt</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mt-2">Coming Soon</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-rose-50/50 font-sans selection:bg-rose-200 overflow-x-hidden">
            {view === 'HOME' && renderHome()}
            {view === 'HOST_LOBBY' && renderHostLobby()}
            {view === 'JOIN_LOBBY' && renderJoinLobby()}
            {view === 'HUB' && renderHub()}
            {view === 'DRAWING' && (
                <DrawingGame 
                    sendEvent={sendGameEvent} 
                    onBack={() => handleSyncScreen('HUB')} 
                />
            )}
            {view === 'PHOTO_BOOTH' && (
                <PhotoBooth 
                    sendEvent={sendGameEvent} 
                    lastEvent={lastEvent} 
                    onBack={() => handleSyncScreen('HUB')} 
                    roomCode={roomCode || joinInput}
                />
            )}
            {view === 'DEBATE' && (
                <DebateGame 
                    sendEvent={sendGameEvent} 
                    lastEvent={lastEvent} 
                    onBack={() => handleSyncScreen('HUB')} 
                />
            )}
            {view === 'QUIZ' && (
                <QuizGame 
                    sendEvent={sendGameEvent} 
                    lastEvent={lastEvent} 
                    onBack={() => handleSyncScreen('HUB')} 
                />
            )}
            {view === 'WATCH_TOGETHER' && (
                <WatchTogether 
                    sendEvent={sendGameEvent} 
                    onBack={() => handleSyncScreen('HUB')} 
                    myId={myId}
                />
            )}

            {/* Global Legal Modal */}
            {renderLegalModal()}

            {/* Disconnect / Expire Warning Notification */}
            {disconnectWarning && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl z-[100] animate-in slide-in-from-top-4 fade-in flex items-center gap-3">
                    <span className="relative flex h-3 w-3 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    <span className="font-medium text-sm whitespace-nowrap">{disconnectWarning}</span>
                </div>
            )}

            {/* Global Chat Overlay */}
            {(roomCode || joinInput) && view !== 'HOME' && view !== 'HOST_LOBBY' && view !== 'JOIN_LOBBY' && (
                <>
                    <button
                        onClick={() => { setIsChatOpen(true); setUnreadCount(0); }}
                        className="fixed bottom-6 right-6 lg:right-[calc(50%-13rem)] bg-gray-900 text-white p-4 rounded-full shadow-2xl hover:scale-105 transition-transform z-40 active:scale-95 border-2 border-white/20"
                    >
                        <MessageCircle className="w-6 h-6" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-gray-900 shadow-sm animate-bounce">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {isChatOpen && (
                        <div 
                            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 transition-opacity duration-300 pointer-events-auto"
                            onClick={() => setIsChatOpen(false)}
                        />
                    )}
                    <ChatDrawer
                        isOpen={isChatOpen}
                        onClose={() => setIsChatOpen(false)}
                        messages={chatMessages}
                        onSendMessage={sendChatMessage}
                        myId={myId}
                        partnerConnected={partnerConnected}
                    />
                </>
            )}
        </div>
    );
}

// --- Component: Sliding Chat Drawer ---
function ChatDrawer({ isOpen, onClose, messages, onSendMessage, myId, partnerConnected }: { isOpen: boolean, onClose: () => void, messages: any[], onSendMessage: (txt: string) => void, myId: string, partnerConnected: boolean }) {
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim()) return;
        onSendMessage(inputText.trim());
        setInputText('');
    };

    return (
        <div className={`fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-rose-50/95 backdrop-blur-xl shadow-2xl z-50 flex flex-col border-l border-white/40 transform transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            
            <div className="bg-white/80 backdrop-blur-md p-4 flex items-center justify-between border-b border-rose-100 shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
                        <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 leading-tight">Couple's Chat</h3>
                        <p className={`text-xs font-medium flex items-center gap-1 ${partnerConnected ? 'text-emerald-500' : 'text-gray-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${partnerConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} /> 
                            {partnerConnected ? 'Connected' : 'Offline'}
                        </p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-full transition-colors active:scale-95">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3 opacity-60">
                        <MessageCircle className="w-12 h-12" />
                        <p className="text-sm font-medium">No messages yet. Say hi! 👋</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const isMe = msg.senderId === myId;
                        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        
                        return (
                            <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                <div className={`px-4 py-3 max-w-[85%] ${isMe ? 'bg-rose-500 text-white rounded-2xl rounded-tr-sm shadow-md shadow-rose-200' : 'bg-white text-gray-800 rounded-2xl rounded-tl-sm shadow-sm border border-rose-50'}`}>
                                    <p className="text-[15px] leading-relaxed break-words">{msg.text}</p>
                                </div>
                                {time && <span className="text-[10px] text-gray-400 mt-1 px-1 font-medium">{time}</span>}
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white/80 backdrop-blur-md border-t border-rose-100 shrink-0">
                <form onSubmit={handleSend} className="relative flex items-center">
                    <input
                        type="text"
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        placeholder="Type a message..."
                        className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-full pl-5 pr-14 py-3.5 focus:outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 transition-all text-[15px]"
                    />
                    <button 
                        type="submit"
                        disabled={!inputText.trim()}
                        className="absolute right-2 bg-rose-500 disabled:bg-rose-300 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-transform active:scale-90 disabled:shadow-none"
                    >
                        <Send className="w-4 h-4 ml-0.5" />
                    </button>
                </form>
            </div>
        </div>
    );
}

// --- Component: Drawing Game ---
function DrawingGame({ sendEvent, onBack }: { sendEvent: Function, onBack: () => void }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
    const [color, setColor] = useState('#E11D48'); 

    useEffect(() => {
        const resizeCanvas = () => {
            if (canvasRef.current && containerRef.current) {
                canvasRef.current.width = containerRef.current.clientWidth;
                canvasRef.current.height = containerRef.current.clientHeight;
            }
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, []);

    // FAST LANE: Listen for direct custom events to bypass React's batching speed limit
    useEffect(() => {
        const handleRemoteDraw = (e: any) => {
            const event = e.detail;
            if (event.data?.action === 'clear') {
                clearCanvas(false);
            } else if (event.data) {
                drawOnCanvas(event.data.x0, event.data.y0, event.data.x1, event.data.y1, event.data.color, false);
            }
        };
        window.addEventListener('sync-draw-event', handleRemoteDraw);
        return () => window.removeEventListener('sync-draw-event', handleRemoteDraw);
    }, []);

    const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        return {
            x: (clientX - rect.left) / rect.width,
            y: (clientY - rect.top) / rect.height
        };
    };

    const drawOnCanvas = (x0: number, y0: number, x1: number, y1: number, col: string, emit: boolean) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const w = canvas.width;
        const h = canvas.height;

        ctx.beginPath();
        ctx.moveTo(x0 * w, y0 * h);
        ctx.lineTo(x1 * w, y1 * h);
        ctx.strokeStyle = col;
        // The eraser (white) needs to be significantly thicker than the pen to work well
        ctx.lineWidth = col === '#FFFFFF' ? 24 : 6; 
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        if (emit) {
            sendEvent({ activity: 'draw', data: { x0, y0, x1, y1, color: col } });
        }
    };

    const clearCanvas = (emit: boolean) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (emit) {
            // Piggyback on the 'draw' event fast-lane to keep it synchronized instantly
            sendEvent({ activity: 'draw', data: { action: 'clear' } });
        }
    };

    const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDrawing(true);
        setLastPos(getCoordinates(e));
    };

    const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const newPos = getCoordinates(e);
        drawOnCanvas(lastPos.x, lastPos.y, newPos.x, newPos.y, color, true);
        setLastPos(newPos);
    };

    const handleEnd = () => setIsDrawing(false);

    const colors = ['#E11D48', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#111827'];

    return (
        <div className="flex flex-col h-[100dvh] max-h-[100dvh] p-4 max-w-2xl mx-auto w-full bg-rose-50/30">
            <div className="flex items-center justify-between mb-4 bg-white p-3 rounded-2xl shadow-sm">
                <button onClick={onBack} className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-full transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="font-bold text-lg text-gray-800">Draw Together</h2>
                <div className="w-9" /> 
            </div>

            <div 
                ref={containerRef}
                className="flex-1 bg-white rounded-3xl shadow-sm border border-rose-100 overflow-hidden relative touch-none"
            >
                <canvas
                    ref={canvasRef}
                    className={`w-full h-full ${color === '#FFFFFF' ? 'cursor-cell' : 'cursor-crosshair'}`}
                    onMouseDown={handleStart}
                    onMouseMove={handleMove}
                    onMouseUp={handleEnd}
                    onMouseLeave={handleEnd}
                    onTouchStart={handleStart}
                    onTouchMove={handleMove}
                    onTouchEnd={handleEnd}
                />
            </div>

            <div className="flex justify-center items-center gap-2 sm:gap-3 mt-4 bg-white p-3 sm:p-4 rounded-3xl shadow-sm border border-rose-50 overflow-x-auto">
                {colors.map(c => (
                    <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={`w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full transition-all ${color === c ? 'scale-110 ring-4 ring-offset-2 ring-rose-200' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }}
                    />
                ))}
                
                <div className="w-px h-8 bg-gray-200 mx-1 sm:mx-2 shrink-0" />
                
                {/* Eraser Tool */}
                <button
                    onClick={() => setColor('#FFFFFF')}
                    className={`w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center transition-all bg-gray-100 ${color === '#FFFFFF' ? 'scale-110 ring-4 ring-offset-2 ring-gray-300' : 'hover:scale-110'}`}
                    title="Eraser"
                >
                    <Eraser className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                </button>

                {/* Clear Board Tool */}
                <button
                    onClick={() => clearCanvas(true)}
                    className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center transition-all bg-red-50 hover:bg-red-100 text-red-500 hover:scale-110"
                    title="Clear Board"
                >
                    <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
            </div>
        </div>
    );
}

// --- Component: PhotoBooth Game ---
type PhotoFrame = { local: string | null; peer: string | null };

function PhotoBooth({ sendEvent, lastEvent, onBack, roomCode }: { sendEvent: Function, lastEvent: any, onBack: () => void, roomCode: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [frames, setFrames] = useState<PhotoFrame[]>([]);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [isFlashing, setIsFlashing] = useState(false);
    const [hasCameraError, setHasCameraError] = useState(false);
    const [isShooting, setIsShooting] = useState(false);
    const [bgColor, setBgColor] = useState('#ffffff');
    const backgroundColors = ['#ffffff', '#000000', '#fcd34d', '#f472b6', '#38bdf8', '#22c55e', '#1f2937'];

    useEffect(() => {
        let activeStream: MediaStream;
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
            .then(s => {
                activeStream = s;
                setStream(s);
                if (videoRef.current) videoRef.current.srcObject = s;
            })
            .catch(err => {
                console.error("Camera error:", err);
                setHasCameraError(true);
            });

        return () => {
            if (activeStream) {
                activeStream.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    useEffect(() => {
        if (lastEvent?.activity === 'start-booth-sequence') {
            runPhotoSequence();
        } else if (lastEvent?.activity === 'booth-frame') {
            const { index, image } = lastEvent;
            setFrames(prev => {
                const newFrames = [...prev];
                if (!newFrames[index]) newFrames[index] = { local: null, peer: null };
                newFrames[index].peer = image;
                return newFrames;
            });
        }
    }, [lastEvent]);

    const handleStartSyncedSequence = () => {
        sendEvent({ activity: 'start-booth-sequence' });
        runPhotoSequence();
    };

    const runPhotoSequence = async () => {
        setFrames([]);
        setIsShooting(true);
        
        for (let frameIndex = 0; frameIndex < 4; frameIndex++) {
            for (let c = 3; c > 0; c--) {
                setCountdown(c);
                await new Promise(r => setTimeout(r, 1000));
            }
            setCountdown(null);
            setIsFlashing(true);
            
            const localImg = capturePortraitPhoto();
            if (localImg) {
                sendEvent({ activity: 'booth-frame', index: frameIndex, image: localImg });
                setFrames(prev => {
                    const newFrames = [...prev];
                    if (!newFrames[frameIndex]) newFrames[frameIndex] = { local: null, peer: null };
                    newFrames[frameIndex].local = localImg;
                    return newFrames;
                });
            }
            
            await new Promise(r => setTimeout(r, 150));
            setIsFlashing(false);
            await new Promise(r => setTimeout(r, 850)); 
        }
        setIsShooting(false);
    };

    const capturePortraitPhoto = () => {
        if (!videoRef.current) return null;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        const targetW = 300;
        const targetH = 400;
        canvas.width = targetW;
        canvas.height = targetH;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const videoRatio = video.videoWidth / video.videoHeight;
        const targetRatio = targetW / targetH;
        let sWidth = video.videoWidth;
        let sHeight = video.videoHeight;
        let sX = 0;
        let sY = 0;

        if (videoRatio > targetRatio) {
            sWidth = sHeight * targetRatio;
            sX = (video.videoWidth - sWidth) / 2;
        } else {
            sHeight = sWidth / targetRatio;
            sY = (video.videoHeight - sHeight) / 2;
        }
        
        ctx.translate(targetW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, sX, sY, sWidth, sHeight, 0, 0, targetW, targetH);
        return canvas.toDataURL('image/jpeg', 0.8);
    };

    const downloadStrip = async () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const portraitW = 300;
        const portraitH = 400;
        const gap = 4;
        const padding = 32;
        const bottomArea = 120;
        
        canvas.width = (padding * 2) + (portraitW * 2) + gap;
        canvas.height = padding + (portraitH * 4) + (gap * 3) + bottomArea;

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const loadImage = (src: string | null): Promise<HTMLImageElement | null> => {
            if (!src) return Promise.resolve(null);
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.src = src;
            });
        };

        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const y = padding + (i * (portraitH + gap));
            
            ctx.fillStyle = '#2d2d2d';
            ctx.fillRect(padding, y, portraitW, portraitH);
            ctx.fillRect(padding + portraitW + gap, y, portraitW, portraitH);

            const localImg = await loadImage(frame.local);
            const peerImg = await loadImage(frame.peer);

            if (localImg) ctx.drawImage(localImg, padding, y, portraitW, portraitH);
            if (peerImg) ctx.drawImage(peerImg, padding + portraitW + gap, y, portraitW, portraitH);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            const tagX = padding + 12;
            const tagY = y + 12;
            ctx.fillRect(tagX, tagY, 44, 28);
            
            ctx.fillStyle = '#4b5563';
            ctx.font = '600 16px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`0${i + 1}`, tagX + 22, tagY + 14);
        }

        const isDarkBg = bgColor === '#000000' || bgColor === '#1f2937';
        ctx.fillStyle = isDarkBg ? '#ffffff' : '#374151'; 
        ctx.font = '600 24px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textY = canvas.height - (bottomArea / 2);
        ctx.fillText(`❤ SYNC · ${roomCode}`, canvas.width / 2, textY);

        const link = document.createElement('a');
        link.download = `sync-strip-${roomCode}-${new Date().getTime()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    return (
        <div className="flex flex-col h-[100dvh] max-h-[100dvh] p-4 max-w-2xl mx-auto w-full bg-[#ebebeb]">
            <div className="flex items-center justify-between mb-4 bg-white p-3 rounded-2xl shadow-sm z-10">
                <button onClick={onBack} className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-full transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="font-bold text-lg text-gray-800">Photo Booth</h2>
                <div className="w-9" /> 
            </div>

            {isFlashing && <div className="fixed inset-0 bg-white z-50 animate-pulse" />}

            <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto pb-28 relative w-full">
                {hasCameraError ? (
                    <div className="p-8 text-center bg-white rounded-3xl shadow-sm">
                        <p className="text-gray-600 font-medium">Camera access is required for the photo booth.</p>
                        <p className="text-sm text-gray-400 mt-2">Please check your browser permissions.</p>
                    </div>
                ) : (!isShooting && frames.length === 4) ? (
                    <div className="flex flex-col items-center w-full max-w-sm mt-4">
                        <div className="p-4 pb-8 rounded-sm shadow-xl flex flex-col gap-1 w-full transition-colors duration-300 relative" style={{ backgroundColor: bgColor }}>
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-gray-300 shadow-md border-b border-gray-400 z-10" />
                            {frames.map((frame, i) => (
                                <div key={i} className="flex gap-1 w-full relative">
                                    <div className="absolute top-2 left-2 bg-white/90 text-gray-600 px-2 py-1 text-xs font-mono font-bold rounded-sm shadow-sm z-10">
                                        0{i + 1}
                                    </div>
                                    <div className="flex-1 aspect-[3/4] bg-gray-800 relative">
                                        {frame.local && <img src={frame.local} className="absolute inset-0 w-full h-full object-cover" />}
                                    </div>
                                    <div className="flex-1 aspect-[3/4] bg-gray-800 relative flex items-center justify-center">
                                        {frame.peer ? (
                                            <img src={frame.peer} className="absolute inset-0 w-full h-full object-cover" />
                                        ) : (
                                            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div className="mt-4 flex items-center justify-center gap-2" style={{ color: (bgColor === '#000000' || bgColor === '#1f2937') ? '#ffffff' : '#374151' }}>
                                <span className="font-mono font-bold tracking-widest text-sm">
                                    ❤ SYNC · {roomCode}
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 flex flex-col items-center gap-3 bg-white px-6 py-4 rounded-3xl shadow-sm border border-gray-100">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Customize Style</span>
                            <div className="flex gap-3">
                                {backgroundColors.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setBgColor(c)}
                                        className={`w-8 h-8 rounded-full shadow-inner transition-transform ${bgColor === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-300' : 'hover:scale-110'}`}
                                        style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid #e5e7eb' : 'none' }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="relative w-full max-w-[320px] aspect-[3/4] rounded-3xl overflow-hidden bg-gray-900 shadow-xl border-4 border-white">
                        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" />
                        {countdown !== null && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <span className="text-8xl font-black text-white drop-shadow-lg animate-bounce">{countdown}</span>
                            </div>
                        )}
                        {isShooting && (
                            <div className="absolute top-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm font-bold backdrop-blur-sm">
                                {frames.length}/4
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="fixed bottom-6 left-0 right-0 px-6 flex justify-center gap-4 z-20">
                {!isShooting && frames.length < 4 ? (
                    <button 
                        onClick={handleStartSyncedSequence}
                        disabled={!stream}
                        className="bg-rose-500 hover:bg-rose-600 disabled:bg-gray-300 text-white px-8 py-4 rounded-full font-bold text-lg shadow-lg flex items-center gap-3 transition-all active:scale-95"
                    >
                        <Camera className="w-6 h-6" /> Start Booth
                    </button>
                ) : (!isShooting && frames.length === 4) && (
                    <>
                        <button 
                            onClick={() => { setFrames([]); setBgColor('#ffffff'); }}
                            className="bg-white text-gray-700 w-14 h-14 flex items-center justify-center rounded-full font-bold shadow-lg transition-all active:scale-95 border border-gray-100"
                        >
                            <RotateCcw className="w-6 h-6" />
                        </button>
                        <button 
                            onClick={downloadStrip}
                            className="bg-gray-900 text-white px-8 py-4 rounded-full font-bold shadow-lg flex items-center gap-2 transition-all active:scale-95 flex-1 max-w-[200px]"
                        >
                            <Download className="w-5 h-5" /> Download
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

// --- Component: Debate Game ---
function DebateGame({ sendEvent, lastEvent, onBack }: { sendEvent: Function, lastEvent: any, onBack: () => void }) {
    const [step, setStep] = useState<'SETUP' | 'DEBATING' | 'JUDGING' | 'RESULT'>('SETUP');
    const [topic, setTopic] = useState('');
    const [myStance, setMyStance] = useState<'FOR' | 'AGAINST'>('FOR');
    const [timeLeft, setTimeLeft] = useState(60);
    const [verdict, setVerdict] = useState<{winner: 'FOR' | 'AGAINST', reason: string} | null>(null);

    const topics = [
        "Is a hotdog a sandwich?",
        "Who takes longer to get ready?",
        "Pineapple on pizza: Culinary masterpiece or disaster?",
        "Does the toilet paper roll go over or under?",
        "Is cereal considered soup?",
        "Who is the better driver?",
        "Who is more likely to survive a zombie apocalypse?"
    ];

    const verdicts = [
        "The AI Judge was moved to tears by the FOR argument. Pure poetry.",
        "The AGAINST side brought facts, logic, and intimidation. They win.",
        "A terrible debate from both sides, but FOR was slightly less terrible.",
        "AGAINST wins on a technicality. The AI Judge likes their vibes.",
        "FOR wins. The AI Judge is secretly biased.",
        "The AI Judge finds the AGAINST argument completely undeniable. Case closed."
    ];

    useEffect(() => {
        if (lastEvent?.activity === 'debate-start') {
            setTopic(lastEvent.topic);
            setMyStance(lastEvent.peerStance);
            setStep('DEBATING');
            setTimeLeft(60);
        } else if (lastEvent?.activity === 'debate-judge') {
            setStep('JUDGING');
        } else if (lastEvent?.activity === 'debate-result') {
            setVerdict(lastEvent.verdict);
            setStep('RESULT');
        } else if (lastEvent?.activity === 'debate-reset') {
            setStep('SETUP');
            setTopic('');
            setVerdict(null);
        }
    }, [lastEvent]);

    useEffect(() => {
        if (step === 'DEBATING' && timeLeft > 0) {
            const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
            return () => clearTimeout(timer);
        } else if (step === 'DEBATING' && timeLeft === 0) {
            if (myStance === 'FOR') {
                handleTimeUp();
            }
        }
    }, [step, timeLeft, myStance]);

    const handleStart = () => {
        const randomTopic = topics[Math.floor(Math.random() * topics.length)];
        const randomStance = Math.random() > 0.5 ? 'FOR' : 'AGAINST';
        const peerStance = randomStance === 'FOR' ? 'AGAINST' : 'FOR';
        
        setTopic(randomTopic);
        setMyStance(randomStance);
        setStep('DEBATING');
        setTimeLeft(60);
        
        sendEvent({ activity: 'debate-start', topic: randomTopic, peerStance });
    };

    const handleTimeUp = () => {
        setStep('JUDGING');
        sendEvent({ activity: 'debate-judge' });
        
        setTimeout(() => {
            const winningStance = (Math.random() > 0.5 ? 'FOR' : 'AGAINST') as "FOR" | "AGAINST";
            const reason = verdicts[Math.floor(Math.random() * verdicts.length)];
            const result = { winner: winningStance, reason };
            
            setVerdict(result);
            setStep('RESULT');
            sendEvent({ activity: 'debate-result', verdict: result });
        }, 3000);
    };

    const handleReset = () => {
        setStep('SETUP');
        setTopic('');
        setVerdict(null);
        sendEvent({ activity: 'debate-reset' });
    };

    return (
        <div className="flex flex-col h-[100dvh] max-h-[100dvh] p-4 max-w-2xl mx-auto w-full bg-rose-50/30">
            <div className="flex items-center justify-between mb-4 bg-white p-3 rounded-2xl shadow-sm shrink-0">
                <button onClick={onBack} className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-full transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="font-bold text-lg text-gray-800">Debate Court</h2>
                <div className="w-9" />
            </div>

            {step === 'SETUP' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-24 h-24 bg-rose-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                        <Gavel className="w-12 h-12 text-rose-500" />
                    </div>
                    <h2 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">Couples Court</h2>
                    <p className="text-gray-500 mb-10 text-lg leading-relaxed">
                        Settle it in court. One random topic. 60 seconds to argue on camera. <br/><br/>
                        <strong>The AI Judge</strong> will hear your arguments and deliver a final, binding verdict.
                    </p>
                    <button onClick={handleStart} className="w-full max-w-sm bg-rose-500 hover:bg-rose-600 text-white rounded-2xl py-4 font-bold text-lg shadow-lg shadow-rose-200 transition-all active:scale-95">
                        Start Trial
                    </button>
                </div>
            )}

            {step === 'DEBATING' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <h3 className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-3">The Topic</h3>
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-rose-50 mb-8 w-full max-w-sm">
                        <h1 className="text-2xl font-black text-gray-900 leading-tight">{topic}</h1>
                    </div>
                    
                    <div className={`p-6 rounded-3xl w-full max-w-sm border-2 mb-10 shadow-sm transition-colors ${myStance === 'FOR' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                        <span className="block text-sm font-bold uppercase mb-1 opacity-70 tracking-widest">You are arguing</span>
                        <span className="text-4xl font-black tracking-tight">{myStance}</span>
                    </div>

                    <div className="relative flex items-center justify-center w-36 h-36">
                        <svg className="absolute inset-0 w-full h-full transform -rotate-90 drop-shadow-sm">
                            <circle cx="72" cy="72" r="66" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white" />
                            <circle cx="72" cy="72" r="66" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray="414" strokeDashoffset={414 - (414 * timeLeft) / 60} className="text-rose-500 transition-all duration-1000 ease-linear" strokeLinecap="round" />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center">
                            <Timer className="w-6 h-6 text-gray-400 mb-1" />
                            <span className="text-4xl font-black text-gray-800 tabular-nums tracking-tighter">{timeLeft}</span>
                        </div>
                    </div>
                </div>
            )}

            {step === 'JUDGING' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-24 h-24 bg-white shadow-sm border border-gray-100 rounded-full flex items-center justify-center mb-8 animate-pulse">
                        <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">The Judge is deliberating...</h2>
                    <p className="text-gray-500 mt-3 text-lg">Weighing the evidence and analyzing the arguments.</p>
                </div>
            )}

            {step === 'RESULT' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500">
                    <div className={`w-28 h-28 rounded-full flex items-center justify-center mb-6 shadow-inner ${verdict?.winner === myStance ? 'bg-emerald-100' : 'bg-gray-200'}`}>
                        <Trophy className={`w-14 h-14 ${verdict?.winner === myStance ? 'text-emerald-500' : 'text-gray-400'}`} />
                    </div>
                    <h2 className={`text-4xl font-black mb-2 tracking-tight ${verdict?.winner === myStance ? 'text-emerald-600' : 'text-gray-800'}`}>
                        {verdict?.winner === myStance ? 'You Won!' : 'You Lost.'}
                    </h2>
                    
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 mt-8 w-full max-w-sm relative">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] uppercase font-black tracking-widest px-4 py-1.5 rounded-full shadow-md">
                            Official Verdict
                        </div>
                        <p className="text-gray-600 font-medium text-lg leading-relaxed mt-2">{verdict?.reason}</p>
                    </div>

                    <button onClick={handleReset} className="w-full max-w-sm mt-10 bg-white border-2 border-rose-100 text-rose-600 rounded-2xl py-4 font-bold text-lg shadow-sm hover:bg-rose-50 transition-all active:scale-95">
                        Demand a Rematch
                    </button>
                </div>
            )}
        </div>
    );
}

// --- Component: Quiz Game ---
function QuizGame({ sendEvent, lastEvent, onBack }: { sendEvent: Function, lastEvent: any, onBack: () => void }) {
    const [step, setStep] = useState<'SETUP' | 'ANSWERING' | 'REVEAL' | 'END'>('SETUP');
    const [questions, setQuestions] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [myAnswer, setMyAnswer] = useState('');
    const [peerAnswer, setPeerAnswer] = useState<string | null>(null);
    const [isLocked, setIsLocked] = useState(false);
    const [peerLocked, setPeerLocked] = useState(false);

    const ALL_QUESTIONS = [
        "What is your partner's favorite comfort food?",
        "What is your partner's dream travel destination?",
        "What is the first movie you watched together?",
        "What is your partner's go-to drink order?",
        "What is your partner's weirdest quirk?",
        "Who said 'I love you' first?",
        "What is your partner's hidden talent?",
        "What is your partner's biggest pet peeve?",
        "What was your partner's childhood dream job?",
        "What is the best gift you've ever given them?",
        "If they could eat only one food forever, what is it?",
        "What is their favorite song right now?"
    ];

    useEffect(() => {
        if (lastEvent?.activity === 'quiz-start') {
            setQuestions(lastEvent.questions);
            setCurrentIndex(0);
            resetRound();
            setStep('ANSWERING');
        } else if (lastEvent?.activity === 'quiz-lock') {
            setPeerAnswer(lastEvent.answer);
            setPeerLocked(true);
        } else if (lastEvent?.activity === 'quiz-next') {
            const { nextIdx, total } = lastEvent;
            if (nextIdx >= total) {
                setStep('END');
            } else {
                setCurrentIndex(nextIdx);
                resetRound();
                setStep('ANSWERING');
            }
        } else if (lastEvent?.activity === 'quiz-reset') {
            setStep('SETUP');
        }
    }, [lastEvent]);

    useEffect(() => {
        if (isLocked && peerLocked && step === 'ANSWERING') {
            setStep('REVEAL');
        }
    }, [isLocked, peerLocked, step]);

    const resetRound = () => {
        setMyAnswer('');
        setPeerAnswer(null);
        setIsLocked(false);
        setPeerLocked(false);
    };

    const startGame = () => {
        const shuffled = [...ALL_QUESTIONS].sort(() => 0.5 - Math.random()).slice(0, 5);
        setQuestions(shuffled);
        setCurrentIndex(0);
        resetRound();
        setStep('ANSWERING');
        sendEvent({ activity: 'quiz-start', questions: shuffled });
    };

    const lockAnswer = () => {
        if (!myAnswer.trim()) return;
        setIsLocked(true);
        sendEvent({ activity: 'quiz-lock', answer: myAnswer });
    };

    const handleNext = () => {
        const nextIdx = currentIndex + 1;
        sendEvent({ activity: 'quiz-next', nextIdx, total: questions.length });
        
        if (nextIdx >= questions.length) {
            setStep('END');
        } else {
            setCurrentIndex(nextIdx);
            resetRound();
            setStep('ANSWERING');
        }
    };

    const handleReset = () => {
        setStep('SETUP');
        sendEvent({ activity: 'quiz-reset' });
    };

    return (
        <div className="flex flex-col h-[100dvh] max-h-[100dvh] p-4 max-w-2xl mx-auto w-full bg-rose-50/30">
            <div className="flex items-center justify-between mb-4 bg-white p-3 rounded-2xl shadow-sm shrink-0">
                <button onClick={onBack} className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-full transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="font-bold text-lg text-gray-800">Couple's Quiz</h2>
                <div className="w-9" />
            </div>

            {step === 'SETUP' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-24 h-24 bg-rose-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                        <HelpCircle className="w-12 h-12 text-rose-500" />
                    </div>
                    <h2 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">How Well Do You Know Me?</h2>
                    <p className="text-gray-500 mb-10 text-lg leading-relaxed">
                        A true compatibility test. 5 random questions. You both lock in your answers privately, then reveal them at the exact same time.
                    </p>
                    <button onClick={startGame} className="w-full max-w-sm bg-rose-500 hover:bg-rose-600 text-white rounded-2xl py-4 font-bold text-lg shadow-lg shadow-rose-200 transition-all active:scale-95">
                        Start Quiz
                    </button>
                </div>
            )}

            {step === 'ANSWERING' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center w-full max-w-md mx-auto">
                    <div className="w-full flex justify-between items-center mb-6">
                        <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Question {currentIndex + 1} of 5</span>
                        {peerLocked && <span className="text-xs bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full font-bold animate-pulse">Partner Locked</span>}
                    </div>
                    
                    <h2 className="text-2xl font-black text-gray-900 mb-8 leading-tight">{questions[currentIndex]}</h2>

                    <textarea 
                        value={myAnswer}
                        onChange={e => setMyAnswer(e.target.value)}
                        disabled={isLocked}
                        placeholder="Type your answer..."
                        className="w-full bg-white border-2 border-rose-100 rounded-3xl p-6 min-h-[140px] text-lg outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100 transition-all resize-none shadow-sm disabled:bg-gray-50 disabled:text-gray-500"
                    />

                    {isLocked ? (
                        <div className="mt-8 flex items-center justify-center gap-3 text-gray-500 font-medium bg-white px-6 py-4 rounded-full shadow-sm border border-gray-100 w-full">
                            <Loader2 className="w-5 h-5 animate-spin text-rose-400" />
                            Waiting for partner...
                        </div>
                    ) : (
                        <button 
                            onClick={lockAnswer} 
                            disabled={!myAnswer.trim()}
                            className="w-full mt-8 bg-rose-500 disabled:bg-rose-300 hover:bg-rose-600 text-white rounded-2xl py-4 font-bold text-lg shadow-lg shadow-rose-200 transition-all active:scale-95"
                        >
                            Lock In Answer
                        </button>
                    )}
                </div>
            )}

            {step === 'REVEAL' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-sm mx-auto animate-in fade-in zoom-in duration-500">
                    <h3 className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-8 text-center">{questions[currentIndex]}</h3>
                    
                    <div className="flex flex-col gap-6 w-full">
                        <div className="bg-emerald-50 border-2 border-emerald-100 rounded-3xl p-6 text-center shadow-sm relative">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-md">Your Answer</div>
                            <p className="text-xl font-bold text-emerald-800 mt-2">{myAnswer}</p>
                        </div>

                        <div className="bg-rose-50 border-2 border-rose-100 rounded-3xl p-6 text-center shadow-sm relative">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-md">Partner's Answer</div>
                            <p className="text-xl font-bold text-rose-800 mt-2">{peerAnswer}</p>
                        </div>
                        
                        <button onClick={handleNext} className="mt-8 w-full bg-gray-900 hover:bg-black text-white rounded-2xl py-4 font-bold text-lg shadow-lg shadow-gray-200 transition-all active:scale-95">
                            Next Question
                        </button>
                    </div>
                </div>
            )}

            {step === 'END' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500">
                    <div className="w-28 h-28 bg-rose-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                        <Heart className="w-14 h-14 text-rose-500 fill-rose-500" />
                    </div>
                    <h2 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">Quiz Complete!</h2>
                    <p className="text-gray-500 font-medium text-lg leading-relaxed mt-2 max-w-xs">
                        How well did you do? Remember, it's not about being perfect, it's about learning more about each other.
                    </p>

                    <button onClick={handleReset} className="w-full max-w-sm mt-10 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl py-4 font-bold text-lg shadow-lg shadow-rose-200 transition-all active:scale-95">
                        Play Again
                    </button>
                </div>
            )}
        </div>
    );
}

// --- Component: Watch Together ---
function WatchTogether({ sendEvent, onBack, myId }: { sendEvent: Function, onBack: () => void, myId: string }) {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const screenVideoRef = useRef<HTMLVideoElement>(null);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const screenSendersRef = useRef<RTCRtpSender[]>([]);
    
    const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
    const [hasScreenShare, setHasScreenShare] = useState(false);
    const [micEnabled, setMicEnabled] = useState(true);
    const [camEnabled, setCamEnabled] = useState(true);

    const makingOfferRef = useRef(false);
    const ignoreOfferRef = useRef(false);

    useEffect(() => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        pc.onnegotiationneeded = async () => {
            try {
                makingOfferRef.current = true;
                await pc.setLocalDescription();
                sendEvent({ activity: 'webrtc-offer', sdp: pc.localDescription, senderId: myId });
            } catch (err) {
                console.error("Negotiation error:", err);
            } finally {
                makingOfferRef.current = false;
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendEvent({ activity: 'webrtc-ice', candidate: event.candidate, senderId: myId });
            }
        };

        pc.ontrack = (event) => {
            const stream = event.streams[0];
            if (!remoteVideoRef.current?.srcObject) {
                if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
                setHasRemoteVideo(true);
            } else if (remoteVideoRef.current.srcObject !== stream) {
                if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
                setHasScreenShare(true);
            }
        };

        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                setLocalStream(stream);
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
                stream.getTracks().forEach(track => pc.addTrack(track, stream));
            })
            .catch(err => {
                console.error("Failed to get local media", err);
                alert("Could not access camera/microphone. Please allow permissions in your browser.");
            });

        const handleSyncEvent = async (e: any) => {
            const event = e.detail;
            const pc = pcRef.current;
            if (!pc || !event || !event.activity.startsWith('webrtc')) return;

            const isPolite = myId > event.senderId;

            try {
                if (event.activity === 'webrtc-offer') {
                    const offerCollision = makingOfferRef.current || pc.signalingState !== 'stable';
                    ignoreOfferRef.current = !isPolite && offerCollision;

                    if (ignoreOfferRef.current) return;

                    if (offerCollision) {
                        await pc.setLocalDescription({ type: 'rollback' });
                    }

                    await pc.setRemoteDescription(new RTCSessionDescription(event.sdp));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    sendEvent({ activity: 'webrtc-answer', sdp: pc.localDescription, senderId: myId });
                } 
                else if (event.activity === 'webrtc-answer') {
                    if (!ignoreOfferRef.current) {
                        await pc.setRemoteDescription(new RTCSessionDescription(event.sdp));
                    }
                } 
                else if (event.activity === 'webrtc-ice') {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(event.candidate));
                    } catch (err) {
                        if (!ignoreOfferRef.current) console.error("ICE error", err);
                    }
                }
            } catch (err) {
                console.error("Signaling error:", err);
            }
        };

        window.addEventListener('sync-game-event', handleSyncEvent);

        return () => {
            window.removeEventListener('sync-game-event', handleSyncEvent);
            pc.getSenders().forEach(sender => sender.track?.stop());
            pc.close();
        };
    }, [myId]); 

    const toggleScreenShare = async () => {
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            setScreenStream(null);
            setHasScreenShare(false);
            
            screenSendersRef.current.forEach(sender => {
                try { pcRef.current?.removeTrack(sender); } catch(e) {}
            });
            screenSendersRef.current = [];
            
            if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                setScreenStream(stream);
                setHasScreenShare(true);
                
                if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;

                const senders: RTCRtpSender[] = [];
                stream.getTracks().forEach(track => {
                    const sender = pcRef.current?.addTrack(track, stream);
                    if (sender) senders.push(sender);
                    track.onended = () => {
                        toggleScreenShare(); 
                    };
                });
                screenSendersRef.current = senders;
            } catch (err) {
                console.error("Screen share error", err);
            }
        }
    };

    const toggleMic = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setMicEnabled(audioTrack.enabled);
            }
        }
    };

    const toggleCam = () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setCamEnabled(videoTrack.enabled);
            }
        }
    };

    return (
        <div className="flex flex-col h-[100dvh] w-full bg-gray-950 text-white relative">
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-50 bg-gradient-to-b from-black/60 to-transparent">
                <button onClick={onBack} className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full transition-colors text-white">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="text-center">
                    <h2 className="font-bold text-lg tracking-wide">Watch Together</h2>
                    <p className="text-xs text-gray-300">Live Connection</p>
                </div>
                <div className="w-9" />
            </div>

            <div className="flex flex-col h-full pt-16 pb-24 px-4 gap-4">
                <div className="flex-1 bg-black rounded-3xl overflow-hidden relative shadow-2xl border border-gray-800 flex items-center justify-center">
                    {!hasScreenShare && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 p-6 text-center z-0">
                            <MonitorPlay className="w-16 h-16 mb-4 opacity-50" />
                            <p className="font-medium text-lg text-gray-400">No screen is being shared.</p>
                            <p className="text-sm mt-2 max-w-sm">Click the Share Screen button below to stream a movie or video to your partner.</p>
                            <div className="mt-6 bg-yellow-500/10 border border-yellow-500/20 text-yellow-200/80 p-3 rounded-xl text-xs max-w-sm">
                                <strong>Note:</strong> Netflix/Hulu may show a black screen due to DRM. To fix this, turn off "Hardware Acceleration" in your browser settings.
                            </div>
                        </div>
                    )}
                    <video ref={screenVideoRef} autoPlay playsInline className={`w-full h-full object-contain relative z-10 ${hasScreenShare ? 'opacity-100' : 'opacity-0'}`} />
                </div>

                <div className="h-48 md:h-56 w-full flex gap-4 shrink-0">
                    <div className="flex-1 bg-gray-900 rounded-3xl overflow-hidden relative shadow-lg border border-gray-800">
                        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                        <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2">
                            You {!micEnabled && <MicOff className="w-3 h-3 text-red-400" />}
                        </div>
                    </div>

                    <div className="flex-1 bg-gray-900 rounded-3xl overflow-hidden relative shadow-lg border border-gray-800 flex items-center justify-center">
                        {!hasRemoteVideo && <Loader2 className="w-6 h-6 animate-spin text-gray-600" />}
                        <video ref={remoteVideoRef} autoPlay playsInline className={`w-full h-full object-cover scale-x-[-1] ${hasRemoteVideo ? 'opacity-100' : 'opacity-0'}`} />
                        <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium">
                            Partner
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-xl border border-gray-700 p-2 rounded-full shadow-2xl flex items-center gap-2">
                <button onClick={toggleMic} className={`p-4 rounded-full transition-all ${micEnabled ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}>
                    {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button onClick={toggleCam} className={`p-4 rounded-full transition-all ${camEnabled ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}>
                    {camEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
                <div className="w-px h-8 bg-gray-700 mx-1" />
                <button onClick={toggleScreenShare} className={`px-6 py-4 rounded-full transition-all flex items-center gap-2 font-bold ${screenStream ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-rose-500 hover:bg-rose-600 text-white'}`}>
                    <MonitorUp className="w-5 h-5" />
                    {screenStream ? 'Sharing...' : 'Share Screen'}
                </button>
            </div>
        </div>
    );
}