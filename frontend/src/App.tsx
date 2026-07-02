import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
// 1. Add MonitorPlay and Map to the lucide-react imports
import { Heart, Pencil, Image as ImageIcon, ArrowLeft, Loader2, Camera, Download, RotateCcw, Scale, Gavel, Timer, Trophy, HelpCircle, MonitorPlay, Map } from 'lucide-react';

type ViewState = 'HOME' | 'HOST_LOBBY' | 'JOIN_LOBBY' | 'HUB' | 'DRAWING' | 'PHOTO_BOOTH' | 'DEBATE' | 'QUIZ';

export default function App() {
    // --- Application State ---
    const [view, setView] = useState<ViewState>('HOME');
    const [roomCode, setRoomCode] = useState('');
    const [joinInput, setJoinInput] = useState('');
    const [lastEvent, setLastEvent] = useState<any>(null);
    const [errorMsg, setErrorMsg] = useState('');
    
    // --- Network Mode State ---
    const [networkMode] = useState<'demo' | 'server'>('server');
    const channelRef = useRef<BroadcastChannel | null>(null);
    const socketRef = useRef<Socket | null>(null);

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
                    channel.postMessage({ type: 'ROOM_READY', payload: { code: state.roomCode } });
                    setView('HUB');
                } else if (type === 'ROOM_READY' && state.view === 'JOIN_LOBBY' && payload.code === state.joinInput) {
                    setView('HUB');
                } else if (type === 'GAME_EVENT') {
                    setLastEvent(payload);
                } else if (type === 'PEER_DISCONNECT') {
                    handleDisconnect();
                }
            };
            return () => channel.close();
        } else {
            // Replace with your actual Render URL
            const socket = io('https://sync-backend-63p7.onrender.com');
            socketRef.current = socket;

            socket.on('room-created', (code) => {
                setRoomCode(code);
                setView('HOST_LOBBY');
            });
            socket.on('room-ready', () => {
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
                <span className="px-3 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-full flex items-center gap-2 border border-emerald-100">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setView('DRAWING')} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-rose-100 group relative overflow-hidden text-center">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shrink-0">
                        <Pencil className="text-rose-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-800 text-sm mb-1">Draw Together</span>
                    <span className="text-[11px] text-gray-500 leading-snug">Share a live canvas and doodle together.</span>
                </button>

                <button onClick={() => setView('PHOTO_BOOTH')} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-rose-100 group relative overflow-hidden text-center">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shrink-0">
                        <ImageIcon className="text-rose-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-800 text-sm mb-1">Photo Booth</span>
                    <span className="text-[11px] text-gray-500 leading-snug">Pose and snap 4 synced photos together.</span>
                </button>

                <button onClick={() => setView('DEBATE')} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-rose-100 group relative overflow-hidden text-center">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shrink-0">
                        <Scale className="text-rose-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-800 text-sm mb-1">Debate Court</span>
                    <span className="text-[11px] text-gray-500 leading-snug">Argue a topic. Let an AI judge decide who wins.</span>
                </button>

                <button onClick={() => setView('QUIZ')} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-rose-100 group relative overflow-hidden text-center">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shrink-0">
                        <HelpCircle className="text-rose-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-800 text-sm mb-1">Couple's Quiz</span>
                    <span className="text-[11px] text-gray-500 leading-snug">Answer secretly, then reveal to see if you match!</span>
                </button>

                {/* Watch Together (Coming Soon) */}
                <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-3xl border border-gray-100 opacity-60 text-center">
                    <div className="w-12 h-12 bg-gray-200 rounded-2xl flex items-center justify-center mb-3">
                        <MonitorPlay className="text-gray-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-600 text-sm">Watch Together</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mt-2">Coming Soon</span>
                </div>

                {/* Snap Hunt (Coming Soon) */}
                <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-3xl border border-gray-100 opacity-60 text-center">
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
            {view === 'PHOTO_BOOTH' && (
                <PhotoBooth 
                    sendEvent={sendGameEvent} 
                    lastEvent={lastEvent} 
                    onBack={() => setView('HUB')} 
                    roomCode={roomCode || joinInput}
                />
            )}
            {/* 4. Render the Debate Game view */}
            {view === 'DEBATE' && (
                <DebateGame 
                    sendEvent={sendGameEvent} 
                    lastEvent={lastEvent} 
                    onBack={() => setView('HUB')} 
                />
            )}
            {/* 5. Render the Quiz Game view */}
            {view === 'QUIZ' && (
                <QuizGame 
                    sendEvent={sendGameEvent} 
                    lastEvent={lastEvent} 
                    onBack={() => setView('HUB')} 
                />
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
                <div className="w-9" /> 
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

// --- Interactive Game Component: Split Screen Photo Booth ---
type PhotoFrame = { local: string | null; peer: string | null };

function PhotoBooth({ sendEvent, lastEvent, onBack, roomCode }: { sendEvent: Function, lastEvent: any, onBack: () => void, roomCode: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    
    // Store both local and peer images for 4 frames
    const [frames, setFrames] = useState<PhotoFrame[]>([]);
    
    const [countdown, setCountdown] = useState<number | null>(null);
    const [isFlashing, setIsFlashing] = useState(false);
    const [hasCameraError, setHasCameraError] = useState(false);
    const [isShooting, setIsShooting] = useState(false);

    // Customization state
    const [bgColor, setBgColor] = useState('#ffffff');
    const backgroundColors = ['#ffffff', '#000000', '#fcd34d', '#f472b6', '#38bdf8', '#22c55e', '#1f2937'];

    // 1. Setup webcam stream
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

    // 2. Listen for partner events
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

    // 3. The 4-Photo Countdown Sequence Loop
    const runPhotoSequence = async () => {
        setFrames([]);
        setIsShooting(true);
        
        for (let frameIndex = 0; frameIndex < 4; frameIndex++) {
            // Count down: 3, 2, 1
            for (let c = 3; c > 0; c--) {
                setCountdown(c);
                await new Promise(r => setTimeout(r, 1000));
            }
            setCountdown(null);
            
            // Flash Effect
            setIsFlashing(true);
            
            // Capture and Send
            const localImg = capturePortraitPhoto();
            if (localImg) {
                sendEvent({ activity: 'booth-frame', index: frameIndex, image: localImg });
                
                // Save locally
                setFrames(prev => {
                    const newFrames = [...prev];
                    if (!newFrames[frameIndex]) newFrames[frameIndex] = { local: null, peer: null };
                    newFrames[frameIndex].local = localImg;
                    return newFrames;
                });
            }
            
            // Pause before next countdown
            await new Promise(r => setTimeout(r, 150));
            setIsFlashing(false);
            await new Promise(r => setTimeout(r, 850)); 
        }
        setIsShooting(false);
    };

    // 4. Capture 3:4 portrait frame from video
    const capturePortraitPhoto = () => {
        if (!videoRef.current) return null;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        
        // Target 3:4 aspect ratio (e.g., 300x400)
        const targetW = 300;
        const targetH = 400;
        canvas.width = targetW;
        canvas.height = targetH;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Calculate center crop
        const videoRatio = video.videoWidth / video.videoHeight;
        const targetRatio = targetW / targetH;
        let sWidth = video.videoWidth;
        let sHeight = video.videoHeight;
        let sX = 0;
        let sY = 0;

        if (videoRatio > targetRatio) {
            // Video is wider than target
            sWidth = sHeight * targetRatio;
            sX = (video.videoWidth - sWidth) / 2;
        } else {
            // Video is taller than target
            sHeight = sWidth / targetRatio;
            sY = (video.videoHeight - sHeight) / 2;
        }
        
        // Draw and mirror the image
        ctx.translate(targetW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, sX, sY, sWidth, sHeight, 0, 0, targetW, targetH);
        
        // Use JPEG to keep socket payload size small
        return canvas.toDataURL('image/jpeg', 0.8);
    };

    // 5. Build and Download the final PNG
    const downloadStrip = async () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Strip dimensions matching the exact aesthetic with 4 frames
        const portraitW = 300;
        const portraitH = 400;
        const gap = 4; // Gap between left/right photos
        const padding = 32;
        const bottomArea = 120; // Room for "sync · CODE"
        
        // Width = padding + local_photo + gap + peer_photo + padding
        canvas.width = (padding * 2) + (portraitW * 2) + gap;
        // Height = padding + 4*photos + 3*gaps + bottomArea
        canvas.height = padding + (portraitH * 4) + (gap * 3) + bottomArea;

        // Draw Selected Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Helper to load image from base64
        const loadImage = (src: string | null): Promise<HTMLImageElement | null> => {
            if (!src) return Promise.resolve(null);
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.src = src;
            });
        };

        // Draw all 4 frames
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const y = padding + (i * (portraitH + gap));
            
            // Draw dark gray background slots first
            ctx.fillStyle = '#2d2d2d';
            ctx.fillRect(padding, y, portraitW, portraitH); // Left slot
            ctx.fillRect(padding + portraitW + gap, y, portraitW, portraitH); // Right slot

            // Load and draw actual images
            const localImg = await loadImage(frame.local);
            const peerImg = await loadImage(frame.peer);

            if (localImg) ctx.drawImage(localImg, padding, y, portraitW, portraitH);
            if (peerImg) ctx.drawImage(peerImg, padding + portraitW + gap, y, portraitW, portraitH);

            // Draw the "01, 02, 03, 04" Tag on the top-left of the left photo
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            // draw rounded rect (approximated with simple rect for standard canvas)
            const tagX = padding + 12;
            const tagY = y + 12;
            ctx.fillRect(tagX, tagY, 44, 28);
            
            ctx.fillStyle = '#4b5563'; // dark gray text
            ctx.font = '600 16px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`0${i + 1}`, tagX + 22, tagY + 14);
        }

        // Draw Bottom Text (❤ SYNC · CODE)
        // Determine text color based on background (white text for dark bgs, dark text for light bgs)
        const isDarkBg = bgColor === '#000000' || bgColor === '#1f2937';
        ctx.fillStyle = isDarkBg ? '#ffffff' : '#374151'; 
        ctx.font = '600 24px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textY = canvas.height - (bottomArea / 2);
        // Matching format: "sync · KX7RM"
        ctx.fillText(`❤ SYNC · ${roomCode}`, canvas.width / 2, textY);

        // Trigger Download
        const link = document.createElement('a');
        link.download = `sync-strip-${roomCode}-${new Date().getTime()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    return (
        <div className="flex flex-col h-screen max-h-screen p-4 max-w-2xl mx-auto w-full bg-[#ebebeb]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 bg-white p-3 rounded-2xl shadow-sm z-10">
                <button onClick={onBack} className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-full transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="font-bold text-lg text-gray-800">Photo Booth</h2>
                <div className="w-9" /> 
            </div>

            {isFlashing && <div className="fixed inset-0 bg-white z-50 animate-pulse" />}

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto pb-28 relative w-full">
                
                {hasCameraError ? (
                    <div className="p-8 text-center bg-white rounded-3xl shadow-sm">
                        <p className="text-gray-600 font-medium">Camera access is required for the photo booth.</p>
                        <p className="text-sm text-gray-400 mt-2">Please check your browser permissions.</p>
                    </div>
                ) : (!isShooting && frames.length === 4) ? (
                    /* FINAL STRIP VIEW */
                    <div className="flex flex-col items-center w-full max-w-sm mt-4">
                        <div 
                            className="p-4 pb-8 rounded-sm shadow-xl flex flex-col gap-1 w-full transition-colors duration-300 relative"
                            style={{ backgroundColor: bgColor }}
                        >
                            {/* Aesthetic Pin */}
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-gray-300 shadow-md border-b border-gray-400 z-10" />
                            
                            {frames.map((frame, i) => (
                                <div key={i} className="flex gap-1 w-full relative">
                                    {/* The 01 tag overlay */}
                                    <div className="absolute top-2 left-2 bg-white/90 text-gray-600 px-2 py-1 text-xs font-mono font-bold rounded-sm shadow-sm z-10">
                                        0{i + 1}
                                    </div>
                                    {/* Local (Left) */}
                                    <div className="flex-1 aspect-[3/4] bg-gray-800 relative">
                                        {frame.local && <img src={frame.local} className="absolute inset-0 w-full h-full object-cover" />}
                                    </div>
                                    {/* Peer (Right) */}
                                    <div className="flex-1 aspect-[3/4] bg-gray-800 relative flex items-center justify-center">
                                        {frame.peer ? (
                                            <img src={frame.peer} className="absolute inset-0 w-full h-full object-cover" />
                                        ) : (
                                            <Loader2 className="w-5 h-5 animate-spin text-gray-500" /> // In case peer connection is slow
                                        )}
                                    </div>
                                </div>
                            ))}
                            
                            {/* Bottom Text inside the preview */}
                            <div className="mt-4 flex items-center justify-center gap-2" style={{ color: (bgColor === '#000000' || bgColor === '#1f2937') ? '#ffffff' : '#374151' }}>
                                <span className="font-mono font-bold tracking-widest text-sm">
                                    ❤ SYNC · {roomCode}
                                </span>
                            </div>
                        </div>

                        {/* Color Customizer */}
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
                    /* LIVE CAMERA VIEW */
                    <div className="relative w-full max-w-[320px] aspect-[3/4] rounded-3xl overflow-hidden bg-gray-900 shadow-xl border-4 border-white">
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                        />
                        {countdown !== null && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <span className="text-8xl font-black text-white drop-shadow-lg animate-bounce">
                                    {countdown}
                                </span>
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

            {/* Controls Fixed Bottom */}
            <div className="fixed bottom-6 left-0 right-0 px-6 flex justify-center gap-4 z-20">
                {!isShooting && frames.length < 4 ? (
                    <button 
                        onClick={handleStartSyncedSequence}
                        disabled={!stream}
                        className="bg-rose-500 hover:bg-rose-600 disabled:bg-gray-300 text-white px-8 py-4 rounded-full font-bold text-lg shadow-lg flex items-center gap-3 transition-all active:scale-95"
                    >
                        <Camera className="w-6 h-6" />
                        Start Booth
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

// 5. Add the complete DebateGame component at the very bottom of the file
// --- Interactive Game Component: Debate Court ---
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

    // Receive events from the partner
    useEffect(() => {
        if (lastEvent?.activity === 'debate-start') {
            setTopic(lastEvent.topic);
            setMyStance(lastEvent.peerStance); // Set stance to opposite of initiator
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

    // Timer logic
    useEffect(() => {
        if (step === 'DEBATING' && timeLeft > 0) {
            const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
            return () => clearTimeout(timer);
        } else if (step === 'DEBATING' && timeLeft === 0) {
            // To avoid race conditions, only the 'FOR' player triggers the judgment phase
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
        
        // Broadcast start
        sendEvent({ activity: 'debate-start', topic: randomTopic, peerStance });
    };

    const handleTimeUp = () => {
        setStep('JUDGING');
        sendEvent({ activity: 'debate-judge' });
        
        // Wait 3 seconds to simulate "AI Judging"
        setTimeout(() => {
            // 2. Add 'as "FOR" | "AGAINST"' to strictly type the winner
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
        <div className="flex flex-col h-screen max-h-screen p-4 max-w-2xl mx-auto w-full bg-rose-50/30">
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

// --- Interactive Game Component: Couple's Quiz ---
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
        <div className="flex flex-col h-screen max-h-screen p-4 max-w-2xl mx-auto w-full bg-rose-50/30">
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