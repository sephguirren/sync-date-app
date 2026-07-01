import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Heart, Pencil, Image as ImageIcon, MessageCircle, ArrowLeft, Loader2, Play } from 'lucide-react';

type ViewState = 'HOME' | 'HOST_LOBBY' | 'JOIN_LOBBY' | 'HUB' | 'DRAWING';

export default function App() {
    // --- Application State ---
    const [view, setView] = useState<ViewState>('HOME');
    const [roomCode, setRoomCode] = useState('');
    const [joinInput, setJoinInput] = useState('');
    const [lastEvent, setLastEvent] = useState<any>(null);
    const [errorMsg, setErrorMsg] = useState('');
    
    // --- Network Mode State ---
    // 'demo' uses the browser's BroadcastChannel so you can test in two tabs without a server
    // 'server' connects to the actual Node.js Socket.io backend
    const [networkMode, setNetworkMode] = useState<'demo' | 'server'>('demo');
    const channelRef = useRef<BroadcastChannel | null>(null);
    const socketRef = useRef<Socket | null>(null);

    // Keep state refs fresh for event listeners without triggering re-renders
    const stateRef = useRef({ view, roomCode, joinInput });
    useEffect(() => {
        stateRef.current = { view, roomCode, joinInput };
    }, [view, roomCode, joinInput]);

    // --- Network Initialization ---
    useEffect(() => {
        if (networkMode === 'demo') {
            const channel = new BroadcastChannel('sync-app-demo');
            channelRef.current = channel;

            channel.onmessage = (e) => {
                const { type, payload } = e.data;
                const state = stateRef.current;

                if (type === 'JOIN_REQUEST' && state.view === 'HOST_LOBBY' && payload.code === state.roomCode) {
                    // Host verifies code and accepts guest
                    channel.postMessage({ type: 'ROOM_READY', payload: { code: state.roomCode } });
                    setView('HUB');
                } else if (type === 'ROOM_READY' && state.view === 'JOIN_LOBBY' && payload.code === state.joinInput) {
                    // Guest successfully joined
                    setView('HUB');
                } else if (type === 'GAME_EVENT') {
                    setLastEvent(payload);
                } else if (type === 'PEER_DISCONNECT') {
                    handleDisconnect();
                }
            };
            return () => channel.close();
        } else {
            // Socket.io Implementation (Connects to the Node.js server)
            const socket = io('https://sync-backend-63p7.onrender.com');
            socketRef.current = socket;

            socket.on('room-created', (code) => {
                setRoomCode(code);
                setView('HOST_LOBBY');
            });
            socket.on('room-ready', (code) => {
                setView('HUB');
            });
            socket.on('game-event', (event) => {
                setLastEvent(event);
            });
            socket.on('error', (msg) => {
                setErrorMsg(msg);
                setTimeout(() => setErrorMsg(''), 3000);
            });
            socket.on('peer-disconnected', () => {
                handleDisconnect();
            });

            return () => { socket.close(); };
        }
    }, [networkMode]);

    const handleDisconnect = () => {
        alert("Your partner disconnected.");
        setView('HOME');
        setRoomCode('');
        setJoinInput('');
    };

    // --- Actions ---
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
            // Broadcast join attempt
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

    // --- Views ---
    const renderHome = () => (
        <div className="flex flex-col items-center justify-center min-h-[80vh] w-full max-w-md mx-auto text-center px-6">
            <div className="w-20 h-20 bg-rose-100 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm rotate-3">
                <Heart className="text-rose-500 w-10 h-10 fill-rose-500 animate-pulse" />
            </div>
            <h1 className="text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">Sync</h1>
            <p className="text-gray-500 mb-10 text-lg">Fun dates & activities for long distance relationships.</p>

            <div className="w-full space-y-4">
                <button onClick={createRoom} className="w-full bg-rose-500 hover:bg-rose-600 text-white rounded-2xl py-4 font-bold text-lg transition-all active:scale-[0.98] shadow-lg shadow-rose-200">
                    Create a Date
                </button>
                <button onClick={() => setView('JOIN_LOBBY')} className="w-full bg-white border-2 border-rose-100 text-rose-600 hover:bg-rose-50 rounded-2xl py-4 font-bold text-lg transition-all active:scale-[0.98]">
                    Join with Code
                </button>
            </div>
        </div>
    );

    const renderHostLobby = () => (
        <div className="flex flex-col items-center justify-center min-h-[80vh] w-full max-w-md mx-auto text-center px-6">
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
                <span className="px-3 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-full flex items-center gap-2 border border-emerald-100">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setView('DRAWING')} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-rose-100 group relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-rose-500" />
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <Pencil className="text-rose-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-800 text-sm">Draw Together</span>
                    <span className="text-xs text-rose-500 font-medium mt-1 flex items-center gap-1"><Play className="w-3 h-3 fill-rose-500"/> Play Now</span>
                </button>

                <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-3xl border border-gray-100 opacity-60">
                    <div className="w-12 h-12 bg-gray-200 rounded-2xl flex items-center justify-center mb-3">
                        <ImageIcon className="text-gray-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-600 text-sm">Photo Booth</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mt-2">Coming Soon</span>
                </div>

                <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-3xl border border-gray-100 opacity-60">
                    <div className="w-12 h-12 bg-gray-200 rounded-2xl flex items-center justify-center mb-3">
                        <MessageCircle className="text-gray-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-600 text-sm">Debate Court</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mt-2">Coming Soon</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-rose-50/50 font-sans selection:bg-rose-200">
            {view === 'HOME' && renderHome()}
            {view === 'HOST_LOBBY' && renderHostLobby()}
            {view === 'JOIN_LOBBY' && renderJoinLobby()}
            {view === 'HUB' && renderHub()}
            {view === 'DRAWING' && (
                <DrawingGame 
                    sendEvent={sendGameEvent} 
                    lastEvent={lastEvent} 
                    onBack={() => {
                        sendGameEvent({ activity: 'left-drawing' });
                        setView('HUB');
                    }} 
                />
            )}

            {/* Network Toggle Footer */}
            {view === 'HOME' && (
                <div className="fixed bottom-6 left-0 right-0 flex justify-center">
                    <button
                        onClick={() => setNetworkMode(m => m === 'demo' ? 'server' : 'demo')}
                        className="text-xs text-gray-400 hover:text-rose-500 transition-colors bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100"
                    >
                        {networkMode === 'demo' ? '⚡ Demo Mode Active (Click to use Node.js)' : '🌐 Node.js Mode Active (Click to use Demo)'}
                    </button>
                </div>
            )}
        </div>
    );
}

// --- Interactive Game Component: Draw Together ---
function DrawingGame({ sendEvent, lastEvent, onBack }: { sendEvent: Function, lastEvent: any, onBack: () => void }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
    const [color, setColor] = useState('#E11D48'); // rose-600

    // Setup Canvas Resolution
    useEffect(() => {
        const resizeCanvas = () => {
            if (canvasRef.current && containerRef.current) {
                // Keep drawing crisp by matching internal resolution to display size
                canvasRef.current.width = containerRef.current.clientWidth;
                canvasRef.current.height = containerRef.current.clientHeight;
            }
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, []);

    // Handle incoming events from peer
    useEffect(() => {
        if (lastEvent?.activity === 'draw') {
            const { x0, y0, x1, y1, color } = lastEvent.data;
            drawOnCanvas(x0, y0, x1, y1, color, false);
        }
    }, [lastEvent]);

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

        // Return normalized coordinates (0.0 to 1.0) so it works across different screen sizes
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
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        if (emit) {
            sendEvent({ activity: 'draw', data: { x0, y0, x1, y1, color: col } });
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
        <div className="flex flex-col h-screen max-h-screen p-4 max-w-2xl mx-auto w-full bg-rose-50/30">
            <div className="flex items-center justify-between mb-4 bg-white p-3 rounded-2xl shadow-sm">
                <button onClick={onBack} className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-full transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="font-bold text-lg text-gray-800">Draw Together</h2>
                <div className="w-9" /> {/* Spacer to center title */}
            </div>

            <div 
                ref={containerRef}
                className="flex-1 bg-white rounded-3xl shadow-sm border border-rose-100 overflow-hidden relative touch-none"
            >
                <canvas
                    ref={canvasRef}
                    className="w-full h-full cursor-crosshair"
                    onMouseDown={handleStart}
                    onMouseMove={handleMove}
                    onMouseUp={handleEnd}
                    onMouseLeave={handleEnd}
                    onTouchStart={handleStart}
                    onTouchMove={handleMove}
                    onTouchEnd={handleEnd}
                />
            </div>

            <div className="flex justify-center gap-4 mt-4 bg-white p-4 rounded-3xl shadow-sm border border-rose-50">
                {colors.map(c => (
                    <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={`w-10 h-10 rounded-full transition-all ${color === c ? 'scale-110 ring-4 ring-offset-2 ring-rose-200' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }}
                    />
                ))}
            </div>
        </div>
    );
}