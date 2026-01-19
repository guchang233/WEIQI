import React, { useState, useEffect, useRef } from 'react';
import { GameState, PlayerColor, Point, NetworkMessage, ChatMessage, HistoryEntry } from './types.ts';
import { GoRules, BOARD_SIZE } from './logic/GoRules.ts';
import GoBoard from './components/GoBoard.tsx';

declare global {
  interface Window {
    Peer: any;
  }
}

const EMOJIS = ['😄', '😭', '😠', '😮', '💡', '⚡', '🔥', '👑', '🥳', '🤔', '🤡', '🚀', '💎', '🧊'];

const App: React.FC = () => {
  const [view, setView] = useState<'lobby' | 'game'>('lobby');
  const [gameState, setGameState] = useState<GameState>({
    board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)),
    currentPlayer: 'black',
    captured: { black: 0, white: 0 },
    history: [],
    passCount: 0,
    gameOver: false,
    winner: null,
    lastMove: null,
  });

  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string>('');
  const [myColor, setMyColor] = useState<PlayerColor | 'spectator'>('black');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [cellSize, setCellSize] = useState<number>(20);
  const [pendingMove, setPendingMove] = useState<Point | null>(null);
  
  const [myEmojiCount, setMyEmojiCount] = useState(0);
  const [isWaitingUndoResponse, setIsWaitingUndoResponse] = useState(false);
  const [showUndoRequestModal, setShowUndoRequestModal] = useState(false);

  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [floatingEmoji, setFloatingEmoji] = useState<{emoji: string, id: number} | null>(null);

  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMyEmojiCount(0);
  }, [gameState.history.length]);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isDesktop = w >= 1024;
      
      const headerH = 56;
      const statusH = isDesktop ? 0 : 48;
      const controlH = isDesktop ? 0 : 54;
      const chatH = isDesktop ? 0 : 130;
      
      const padH = isDesktop ? 500 : 24;
      const padV = isDesktop ? 140 : (headerH + statusH + controlH + chatH + 40);

      const availW = w - padH;
      const availH = h - padV;
      const min = Math.min(availW, availH);
      const ideal = Math.floor(min / (BOARD_SIZE + 0.5));
      
      setCellSize(Math.max(isDesktop ? 22 : 12, Math.min(ideal, 32)));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatLog]);

  useEffect(() => {
    const initPeer = () => {
      if (!window.Peer) {
        setTimeout(initPeer, 500);
        return;
      }
      try {
        const peer = new window.Peer();
        peerRef.current = peer;
        peer.on('open', (id: string) => setPeerId(id));
        peer.on('connection', (conn: any) => {
          connRef.current = conn;
          setIsConnected(true);
          setMyColor('black');
          setView('game');
          setupConnection(conn);
          conn.on('open', () => {
            conn.send({ type: 'SYNC', payload: { gameState, chatLog } });
          });
        });
      } catch (e) { console.error(e); }
    };
    initPeer();
    return () => peerRef.current?.destroy();
  }, []);

  const setupConnection = (conn: any) => {
    conn.on('data', (data: NetworkMessage) => handleNetworkMessage(data));
    conn.on('close', () => { 
      setIsConnected(false); 
      addSystemMessage("对手断开连接。"); 
      setIsWaitingUndoResponse(false);
      setShowUndoRequestModal(false);
    });
  };

  const connectToPeer = (id: string) => {
    if (!peerRef.current || !id) return;
    try {
      const conn = peerRef.current.connect(id);
      connRef.current = conn;
      setIsConnected(true);
      setMyColor('white');
      setView('game');
      setupConnection(conn);
    } catch (e) { addSystemMessage("连接失败。"); }
  };

  const handleNetworkMessage = (msg: NetworkMessage) => {
    switch (msg.type) {
      case 'MOVE': executeMove(msg.payload, false); break;
      case 'PASS': processPass(false); break;
      case 'CHAT': receiveChat(msg.payload); break;
      case 'UNDO_REQ': setShowUndoRequestModal(true); break;
      case 'UNDO_ACCEPT': 
        performUndoAction(); 
        setIsWaitingUndoResponse(false); 
        setMessage("悔棋成功");
        setTimeout(() => setMessage(''), 1500);
        break;
      case 'UNDO_DECLINE': 
        setIsWaitingUndoResponse(false); 
        setMessage("对方拒绝了悔棋"); 
        setTimeout(() => setMessage(''), 1500); 
        break;
      case 'SYNC': 
        setGameState(msg.payload.gameState);
        setChatLog(msg.payload.chatLog || []);
        break;
      case 'RESTART': resetGame(false); break;
    }
  };

  const addSystemMessage = (text: string) => {
    const sysMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: '系统',
      text,
      color: 'spectator'
    };
    setChatLog(prev => [...prev, sysMsg]);
  };

  const onBoardClick = (p: Point) => {
    if (gameState.gameOver || isWaitingUndoResponse || showUndoRequestModal) return;
    if (isConnected && gameState.currentPlayer !== myColor) {
      setMessage("还没轮到你");
      setTimeout(() => setMessage(''), 800);
      return;
    }
    if (gameState.board[p.y][p.x] !== null) return;

    if (pendingMove && pendingMove.x === p.x && pendingMove.y === p.y) {
      executeMove(p, true);
      setPendingMove(null);
    } else {
      setPendingMove(p);
      setMessage('再点一次落子');
    }
  };

  const executeMove = (p: Point, shouldSend: boolean = true) => {
    setGameState(prev => {
      const validation = GoRules.isValidMove(prev.board, p, prev.currentPlayer, prev.history.map(h => h.board));
      if (!validation.valid || !validation.newBoard) {
        if (shouldSend) {
          setMessage(validation.error === 'Suicide move is illegal' ? '不能自杀' : '无效步');
          setTimeout(() => setMessage(''), 1200);
        }
        return prev;
      }
      const currentSnapshot: HistoryEntry = {
        board: JSON.stringify(prev.board),
        captured: { ...prev.captured },
        lastMove: prev.lastMove,
        player: prev.currentPlayer
      };
      if (shouldSend && connRef.current) connRef.current.send({ type: 'MOVE', payload: p });
      setMessage('');
      return {
        ...prev,
        board: validation.newBoard,
        currentPlayer: prev.currentPlayer === 'black' ? 'white' : 'black',
        captured: {
            ...prev.captured,
            [prev.currentPlayer]: prev.captured[prev.currentPlayer] + (validation.captured || 0)
        },
        history: [...prev.history, currentSnapshot],
        passCount: 0,
        lastMove: p,
      };
    });
  };

  const requestUndo = () => {
    if (gameState.history.length === 0 || gameState.gameOver || isWaitingUndoResponse) return;
    if (!isConnected) { performUndoAction(); return; }
    setIsWaitingUndoResponse(true);
    addSystemMessage("申请悔棋中...");
    if (connRef.current) connRef.current.send({ type: 'UNDO_REQ', payload: null });
  };

  const respondToUndoRequest = (agreed: boolean) => {
    setShowUndoRequestModal(false);
    if (!connRef.current) return;
    if (agreed) {
      performUndoAction();
      connRef.current.send({ type: 'UNDO_ACCEPT', payload: null });
    } else {
      connRef.current.send({ type: 'UNDO_DECLINE', payload: null });
    }
  };

  const performUndoAction = () => {
    setGameState(prev => {
      if (prev.history.length === 0) return prev;
      const last = prev.history[prev.history.length - 1];
      return {
        ...prev,
        board: JSON.parse(last.board),
        captured: last.captured,
        currentPlayer: last.player,
        lastMove: last.lastMove,
        history: prev.history.slice(0, -1),
        passCount: 0,
      };
    });
    setMessage('');
  };

  const processPass = (shouldSend: boolean = true) => {
    if (gameState.gameOver) return;
    if (isConnected && gameState.currentPlayer !== myColor && shouldSend) return;
    setGameState(prev => {
      const nextPassCount = prev.passCount + 1;
      const isGameOver = nextPassCount >= 2;
      if (shouldSend && connRef.current) connRef.current.send({ type: 'PASS', payload: null });
      addSystemMessage(`${prev.currentPlayer === 'black' ? '黑方' : '白方'} 跳过。`);
      return { 
          ...prev, 
          currentPlayer: prev.currentPlayer === 'black' ? 'white' : 'black', 
          passCount: nextPassCount, 
          gameOver: isGameOver, 
          lastMove: null 
      };
    });
  };

  const resetGame = (shouldSend: boolean = true) => {
    const fresh: GameState = {
      board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)),
      currentPlayer: 'black',
      captured: { black: 0, white: 0 },
      history: [],
      passCount: 0,
      gameOver: false,
      winner: null,
      lastMove: null,
    };
    setGameState(fresh);
    setMyEmojiCount(0);
    addSystemMessage("--- 重新开始 ---");
    if (shouldSend && connRef.current) connRef.current.send({ type: 'RESTART', payload: null });
  };

  const sendChat = (text: string, isEmoji = false) => {
    if (!text.trim()) return;
    if (isEmoji && myEmojiCount >= 3) return;
    if (isEmoji) setMyEmojiCount(c => c + 1);
    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender: myColor === 'black' ? '黑方' : myColor === 'white' ? '白方' : '观战',
      text, isEmoji, color: myColor as PlayerColor
    };
    setChatLog(prev => [...prev, msg]);
    if (isEmoji) { setFloatingEmoji({ emoji: text, id: Date.now() }); setTimeout(() => setFloatingEmoji(null), 1500); }
    if (connRef.current) connRef.current.send({ type: 'CHAT', payload: msg });
    if (!isEmoji) setInputText('');
  };

  const receiveChat = (msg: ChatMessage) => {
    setChatLog(prev => [...prev, msg]);
    if (msg.isEmoji) { setFloatingEmoji({ emoji: msg.text, id: Date.now() }); setTimeout(() => setFloatingEmoji(null), 1500); }
  };

  if (view === 'lobby') {
    return (
      <div className="fixed inset-0 bg-[#080808] flex items-center justify-center p-6 text-white overflow-hidden">
        <div className="w-full max-w-sm bg-neutral-900 border border-white/5 rounded-2xl p-8 flex flex-col gap-6 shadow-2xl">
          <div className="text-center">
            <h1 className="title-font text-5xl text-yellow-500 mb-1">Q弹围棋</h1>
            <p className="text-gray-500 text-[10px] font-bold tracking-widest uppercase tracking-widest">Master Edition</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase px-1">连接 ID</span>
            <div onClick={() => { if(peerId) { navigator.clipboard.writeText(peerId); alert('已复制'); } }} className="bg-black/40 border border-white/5 rounded-xl p-4 text-xs font-mono text-gray-400 flex items-center justify-between cursor-pointer active:bg-black/60 transition-all">
               <span className="truncate mr-4">{peerId || '分配中...'}</span>
               <span className="opacity-50">📋</span>
            </div>
          </div>
          <div className="space-y-4">
            <button onClick={() => setView('game')} className="w-full bg-yellow-600 py-4 rounded-xl font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform shadow-xl shadow-yellow-900/10">本地对弈</button>
            <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-white/5"></div>
                <span className="flex-shrink mx-3 text-[9px] text-gray-600 font-bold tracking-widest uppercase">在线</span>
                <div className="flex-grow border-t border-white/5"></div>
            </div>
            <input type="text" placeholder="好友 ID..." className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-xs outline-none focus:border-indigo-500/40 text-white" value={remotePeerId} onChange={(e) => setRemotePeerId(e.target.value)} />
            <button onClick={() => connectToPeer(remotePeerId)} className="w-full bg-indigo-600 py-4 rounded-xl font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform">联机挑战</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#050505] text-white overflow-hidden select-none">
      <header className="flex-none h-14 flex items-center justify-between px-4 border-b border-white/5 bg-neutral-900/50 backdrop-blur-md z-50">
        <button onClick={() => setView('lobby')} className="text-gray-400 font-bold text-[10px] uppercase tracking-wider px-3 py-2 bg-white/5 rounded-lg border border-white/5 active:scale-95">返回</button>
        <div className="text-center">
           <h2 className="title-font text-lg text-yellow-500 leading-none">Q弹围棋</h2>
           <div className="flex items-center justify-center gap-1.5 mt-0.5">
             <div className={`w-1 h-1 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
             <span className="text-[8px] font-bold text-gray-600 uppercase">{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
           </div>
        </div>
        <button onClick={() => resetGame()} className="text-gray-400 font-bold text-[10px] uppercase tracking-wider px-3 py-2 bg-white/5 rounded-lg border border-white/5 active:scale-95">重置</button>
      </header>

      {/* 手机端紧凑状态条 */}
      <div className="flex-none lg:hidden flex gap-1 px-2 py-1 bg-neutral-900/20 border-b border-white/5 h-12">
          <div className={`flex-1 flex items-center justify-between px-3 rounded-lg border transition-all ${gameState.currentPlayer === 'black' ? 'bg-black border-yellow-500/40' : 'bg-transparent border-transparent opacity-20'}`}>
            <span className="text-lg">☻</span>
            <span className="text-[10px] font-black text-yellow-500">提子 {gameState.captured.black}</span>
          </div>
          <div className={`flex-1 flex items-center justify-between px-3 rounded-lg border transition-all ${gameState.currentPlayer === 'white' ? 'bg-white border-yellow-500/40' : 'bg-transparent border-transparent opacity-20'}`}>
            <span className="text-[10px] font-black text-black">提子 {gameState.captured.white}</span>
            <span className="text-lg text-black">☺</span>
          </div>
      </div>

      <main className="flex-1 flex flex-col lg:flex-row p-2 lg:p-8 gap-4 overflow-hidden items-center justify-center">
        {/* PC 端侧栏 */}
        <aside className="hidden lg:flex flex-col gap-4 w-48 self-stretch py-4 shrink-0">
           <div className={`p-5 rounded-2xl border-2 transition-all ${gameState.currentPlayer === 'black' ? 'bg-black border-yellow-500 shadow-2xl' : 'bg-neutral-900/40 border-transparent opacity-30'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold uppercase text-gray-500">Black</span>
                <span className="text-2xl">☻</span>
              </div>
              <p className="text-yellow-500 font-black text-sm">提子: {gameState.captured.black}</p>
           </div>
           <div className={`p-5 rounded-2xl border-2 transition-all ${gameState.currentPlayer === 'white' ? 'bg-white border-yellow-500 shadow-2xl' : 'bg-neutral-900/40 border-transparent opacity-30'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-black text-[10px] font-bold uppercase opacity-40">White</span>
                <span className="text-2xl text-black">☺</span>
              </div>
              <p className="text-neutral-500 font-black text-sm">提子: {gameState.captured.white}</p>
           </div>
           <div className="mt-auto space-y-2">
             <button onClick={() => processPass()} disabled={gameState.gameOver} className="w-full py-4 rounded-xl font-bold text-xs border border-white/10 hover:bg-white/5 active:scale-95 transition-all uppercase">跳过一手</button>
             <button onClick={requestUndo} disabled={gameState.gameOver || gameState.history.length === 0} className="w-full py-4 rounded-xl font-bold text-xs bg-indigo-900/20 border border-indigo-500/20 text-indigo-100 uppercase transition-all active:scale-95">悔棋 Undo</button>
           </div>
        </aside>

        {/* 棋盘主区 */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-0 w-full relative">
           <div className="relative">
              <GoBoard 
                board={gameState.board} onMove={onBoardClick} currentPlayer={gameState.currentPlayer}
                disabled={gameState.gameOver || showUndoRequestModal} cellSize={cellSize}
                pendingMove={pendingMove} lastMove={gameState.lastMove}
              />
              
              {showUndoRequestModal && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl p-4">
                   <div className="bg-neutral-900 p-6 rounded-2xl border border-indigo-500/50 shadow-2xl flex flex-col items-center gap-4 text-center max-w-[220px]">
                      <p className="font-bold text-xs text-white uppercase tracking-widest">对手申请悔棋</p>
                      <div className="flex gap-2 w-full">
                         <button onClick={() => respondToUndoRequest(false)} className="flex-1 bg-neutral-800 py-3 rounded-lg text-[9px] font-bold uppercase active:scale-95">拒绝</button>
                         <button onClick={() => respondToUndoRequest(true)} className="flex-1 bg-indigo-600 py-3 rounded-lg text-[9px] font-bold uppercase active:scale-95">同意</button>
                      </div>
                   </div>
                </div>
              )}

              {gameState.gameOver && (
                <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md rounded-xl animate-fade-in">
                   <div className="bg-neutral-900 p-10 rounded-2xl border border-yellow-500/30 shadow-2xl flex flex-col items-center gap-5 text-center">
                      <h3 className="title-font text-3xl text-yellow-500 uppercase">对局结束</h3>
                      <p className="font-bold text-white tracking-widest">{gameState.winner === 'draw' ? '平局' : `${gameState.winner === 'black' ? '黑方' : '白方'} 胜出`}</p>
                      <button onClick={() => resetGame()} className="bg-yellow-600 py-4 px-8 rounded-xl font-bold text-[10px] uppercase tracking-widest active:scale-95">重新开局</button>
                   </div>
                </div>
              )}

              {message && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-yellow-500 text-black px-5 py-2 rounded-full font-black text-[9px] uppercase shadow-2xl z-[120] animate-bounce pointer-events-none">{message}</div>}
              {floatingEmoji && <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[130]"><span className="text-7xl animate-emoji-pop">{floatingEmoji.emoji}</span></div>}
           </div>
        </div>

        {/* 手机底部控制栏 */}
        <div className="lg:hidden flex-none w-full h-14 flex gap-2 px-1">
            <button onClick={() => processPass()} disabled={gameState.gameOver} className="flex-1 bg-neutral-800 rounded-xl font-bold text-[10px] uppercase active:scale-95 border border-white/5">跳过一手</button>
            <button onClick={requestUndo} disabled={gameState.gameOver || gameState.history.length === 0} className="flex-1 bg-indigo-900/30 border border-indigo-500/20 rounded-xl font-bold text-[10px] uppercase active:scale-95">申请悔棋</button>
        </div>

        {/* 聊天消息 */}
        <aside className="flex-none lg:w-72 flex flex-col gap-2 h-32 lg:h-full lg:max-h-[600px] overflow-hidden self-stretch shrink-0">
          <div className="flex-1 bg-neutral-900/30 rounded-xl border border-white/5 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5 no-scrollbar text-[11px]">
              {chatLog.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.color === 'spectator' ? 'items-center' : m.sender === (myColor === 'black' ? '黑方' : '白方') ? 'items-end' : 'items-start'}`}>
                  {m.color !== 'spectator' && <span className="text-[7px] text-gray-600 mb-0.5 px-1 font-bold">{m.sender}</span>}
                  <div className={`px-2.5 py-1.5 rounded-lg ${m.color === 'spectator' ? 'text-gray-600 italic text-[9px]' : m.sender === (myColor === 'black' ? '黑方' : '白方') ? 'bg-indigo-600/50 text-white rounded-tr-none' : 'bg-neutral-800 text-white rounded-tl-none'} ${m.isEmoji ? 'text-2xl bg-transparent p-0' : 'border border-white/5 shadow-sm'}`}>{m.text}</div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            
            <div className="p-1.5 bg-black/20 flex gap-2 overflow-x-auto no-scrollbar shrink-0 border-t border-white/5">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => sendChat(e, true)} disabled={myEmojiCount >= 3} className={`text-lg px-0.5 transition-all ${myEmojiCount >= 3 ? 'grayscale opacity-5 pointer-events-none' : 'hover:scale-125'}`}>{e}</button>
              ))}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); sendChat(inputText); }} className="p-2 bg-black/40 flex gap-2 shrink-0">
              <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="聊天..." className="flex-1 bg-white/5 border border-white/5 rounded-lg text-[10px] outline-none text-white px-3 py-2 placeholder:text-gray-700" />
              <button type="submit" className="bg-indigo-600 px-3 py-2 rounded-lg text-[8px] font-black uppercase transition-all active:scale-95">发送</button>
            </form>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default App;