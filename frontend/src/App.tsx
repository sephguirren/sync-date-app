import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Heart, Pencil, Image as ImageIcon, MessageCircle, ArrowLeft, Loader2, Play, Camera, Download, RotateCcw} from 'lucide-react';

type ViewState = 'HOME' | 'HOST_LOBBY' | 'JOIN_LOBBY' | 'HUB' | 'DRAWING' | 'PHOTO_BOOTH';

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
                <button onClick={() => setView('DRAWING')} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-rose-100 group relative overflow-hidden">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <Pencil className="text-rose-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-800 text-sm">Draw Together</span>
                    <span className="text-xs text-rose-500 font-medium mt-1 flex items-center gap-1"><Play className="w-3 h-3 fill-rose-500"/> Play Now</span>
                </button>

                <button onClick={() => setView('PHOTO_BOOTH')} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all border border-transparent hover:border-rose-100 group relative overflow-hidden">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <ImageIcon className="text-rose-500 w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-800 text-sm">Photo Booth</span>
                    <span className="text-xs text-rose-500 font-medium mt-1 flex items-center gap-1"><Play className="w-3 h-3 fill-rose-500"/> Play Now</span>
                </button>

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
            {view === 'PHOTO_BOOTH' && (
                <PhotoBooth 
                    sendEvent={sendGameEvent} 
                    lastEvent={lastEvent} 
                    onBack={() => setView('HUB')} 
                    roomCode={roomCode || joinInput}
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