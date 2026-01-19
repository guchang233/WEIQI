
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, PlayerColor, Point, NetworkMessage, ChatMessage, HistoryEntry } from './types';
import { GoRules, BOARD_SIZE } from './logic/GoRules';
import GoBoard from './components/GoBoard';

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
  const [flashBlack, setFlashBlack] = useState(false);
  const [flashWhite, setFlashWhite] = useState(false);
  
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
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isDesktop = width >= 1024;
      
      // 更加精准的边距计算，防止溢出
      const headerH = 56;
      const playerBarH = isDesktop ? 0 : 64;
      const controlsH = isDesktop ? 0 : 60;
      const chatH = isDesktop ? 0 : 160;
      
      const horizontalSpace = isDesktop ? 480 : 32;
      const verticalSpace = isDesktop ? 120 : (headerH + playerBarH + controlsH + chatH + 40);

      const availableW = width - horizontalSpace;
      const availableH = height - verticalSpace;
      const minDim = Math.min(availableW, availableH); 
      const idealSize = Math.floor(minDim / (BOARD_SIZE + 0.5));
      
      setCellSize(Math.max(isDesktop ? 22 : 12, Math.min(idealSize, 38)));
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
      addSystemMessage("对手已离开。"); 
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
        setMessage("对方拒绝悔棋"); 
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
      setMessage("等待对手...");
      setTimeout(() => setMessage(''), 800);
      return;
    }
    if (gameState.board[p.y][p.x] !== null) return;

    if (pendingMove && pendingMove.x === p.x && pendingMove.y === p.y) {
      executeMove(p, true);
      setPendingMove(null);
    } else {
      setPendingMove(p);
      setMessage('再点一次确认');
    }
  };

  const executeMove = (p: Point, shouldSend: boolean = true) => {
    setGameState(prev => {
      const validation = GoRules.isValidMove(prev.board, p, prev.currentPlayer, prev.history.map(h => h.board));
      if (!validation.valid || !validation.newBoard) {
        if (shouldSend) {
          setMessage(validation.error === 'Suicide move is illegal' ? '禁止自杀' : '无效');
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
      const nextPlayer = prev.currentPlayer === 'black' ? 'white' : 'black';
      const updatedCaptured = { ...prev.captured };
      const capturedDelta = validation.captured || 0;
      updatedCaptured[prev.currentPlayer] += capturedDelta;
      if (capturedDelta > 0) {
        if (prev.currentPlayer === 'black') { setFlashBlack(true); setTimeout(() => setFlashBlack(false), 500); }
        else { setFlashWhite(true); setTimeout(() => setFlashWhite(false), 500); }
      }
      if (shouldSend && connRef.current) connRef.current.send({ type: 'MOVE', payload: p });
      setMessage('');
      return {
        ...prev,
        board: validation.newBoard,
        currentPlayer: nextPlayer,
        captured: updatedCaptured,
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
      addSystemMessage("你同意了对方悔棋。");
    } else {
      connRef.current.send({ type: 'UNDO_DECLINE', payload: null });
      addSystemMessage("你拒绝了悔棋。");
    }
  };

  const performUndoAction = () => {
    setGameState(prev => {
      if (prev.history.length === 0) return prev;
      const lastHistory = prev.history[prev.history.length - 1];
      return {
        ...prev,
        board: JSON.parse(lastHistory.board),
        captured: lastHistory.captured,
        currentPlayer: lastHistory.player,
        lastMove: lastHistory.lastMove,
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
      const nextPlayer = prev.currentPlayer === 'black' ? 'white' : 'black';
      let winnerInfo: any = null;
      if (isGameOver) {
        let b = 0; let w = 0;
        prev.board.forEach(r => r.forEach(c => { if(c === 'black') b++; if(c === 'white') w++; }));
        const bt = b + prev.captured.black; const wt = w + prev.captured.white;
        winnerInfo = bt > wt ? 'black' : bt < wt ? 'white' : 'draw';
      }
      if (shouldSend && connRef.current) connRef.current.send({ type: 'PASS', payload: null });
      addSystemMessage(`${prev.currentPlayer === 'black' ? '黑方' : '白方'} 跳过一手。`);
      return { ...prev, currentPlayer: nextPlayer, passCount: nextPassCount, gameOver: isGameOver, lastMove: null, winner: winnerInfo || null };
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
    setMessage('对局已重置');
    addSystemMessage("--- 新对局开始 ---");
    if (shouldSend && connRef.current) connRef.current.send({ type: 'RESTART', payload: null });
  };

  const sendChat = (text: string, isEmoji = false) => {
    if (!text.trim()) return;
    if (isEmoji) {
      if (myEmojiCount >= 3) { setMessage("限制3次表情"); setTimeout(() => setMessage(''), 1000); return; }
      setMyEmojiCount(prev => prev + 1);
    }
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
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 text-white">
        <div className="w-full max-w-sm bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-8 flex flex-col gap-8">
          <div className="text-center">
            <h1 className="title-font text-4xl text-yellow-500 mb-1">Q弹围棋</h1>
            <p className="text-gray-500 text-[9px] font-bold tracking-widest uppercase">Blob Go Engine</p>
          </div>
          <div className="space-y-2">
            <span className="text-[9px] font-bold text-gray-500 uppercase px-1">你的连接 ID</span>
            <div onClick={() => { if(peerId) { navigator.clipboard.writeText(peerId); alert('已复制'); } }} className="bg-black/40 border border-white/5 rounded-xl p-4 text-xs font-mono text-gray-300 flex items-center justify-between cursor-pointer hover:border-yellow-500/30 transition-all group">
               <span className="truncate mr-4">{peerId || '正在分配...'}</span>
               <span className="opacity-40 group-hover:opacity-100 transition-opacity">📋</span>
            </div>
          </div>
          <div className="space-y-3">
            <button onClick={() => setView('game')} className="w-full bg-yellow-600 hover:bg-yellow-500 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg">离线单机</button>
            <div className="h-px bg-white/5 my-2" />
            <input type="text" placeholder="好友 ID..." className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-xs outline-none focus:border-indigo-500/50 text-white transition-all" value={remotePeerId} onChange={(e) => setRemotePeerId(e.target.value)} />
            <button onClick={() => connectToPeer(remotePeerId)} className="w-full bg-indigo-600 hover:bg-indigo-500 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95">联机对战</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#080808] text-white overflow-hidden select-none">
      {/* 顶部导航：更紧凑 */}
      <header className="flex-none h-14 flex items-center justify-between px-4 border-b border-white/5 bg-neutral-900/40 backdrop-blur-md z-[60]">
        <button onClick={() => setView('lobby')} className="text-gray-400 font-bold text-[10px] uppercase tracking-wider py-2 px-3 bg-white/5 rounded-lg border border-white/5">退出</button>
        <div className="flex flex-col items-center">
           <h2 className="title-font text-lg text-yellow-500">Q弹围棋</h2>
           <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-[8px] font-bold text-gray-500 uppercase">{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
           </div>
        </div>
        <button onClick={() => resetGame()} className="text-gray-400 font-bold text-[10px] uppercase tracking-wider py-2 px-3 bg-white/5 rounded-lg border border-white/5">重置</button>
      </header>

      {/* 移动端选手栏：位于顶部 */}
      <div className="flex-none lg:hidden flex gap-2 p-2 bg-neutral-900/20 border-b border-white/5 h-16">
          <div className={`flex-1 flex items-center justify-between px-4 rounded-xl border transition-all ${gameState.currentPlayer === 'black' ? 'bg-black border-yellow-500/60 shadow-lg' : 'bg-neutral-900/30 border-transparent opacity-40'}`}>
            <span className="text-xl">☻</span>
            <div className="text-right">
              <p className="text-[8px] uppercase font-bold text-gray-500">Black</p>
              <p className="text-[10px] font-black text-yellow-500">提子 {gameState.captured.black}</p>
            </div>
          </div>
          <div className={`flex-1 flex items-center justify-between px-4 rounded-xl border transition-all ${gameState.currentPlayer === 'white' ? 'bg-white border-yellow-500/60 shadow-lg' : 'bg-neutral-900/30 border-transparent opacity-40'}`}>
            <div className="text-left text-black">
              <p className="text-[8px] uppercase font-bold opacity-60">White</p>
              <p className="text-[10px] font-black">提子 {gameState.captured.white}</p>
            </div>
            <span className="text-xl text-black">☺</span>
          </div>
      </div>

      <main className="flex-1 flex flex-col lg:flex-row p-2 lg:p-4 gap-4 overflow-hidden items-stretch">
        {/* PC 端状态侧边栏 */}
        <aside className="hidden lg:flex flex-col gap-3 w-44 shrink-0">
           <div className={`p-4 rounded-xl border-2 transition-all ${gameState.currentPlayer === 'black' ? 'bg-black border-yellow-500 shadow-xl' : 'bg-neutral-900/30 border-transparent opacity-40'}`}>
              <div className="flex justify-between mb-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Black</span>
                <span className="text-xl">☻</span>
              </div>
              <p className="text-yellow-500 font-black text-xs">提子: {gameState.captured.black}</p>
           </div>
           <div className={`p-4 rounded-xl border-2 transition-all ${gameState.currentPlayer === 'white' ? 'bg-white border-yellow-500 shadow-xl' : 'bg-neutral-900/30 border-transparent opacity-40'}`}>
              <div className="flex justify-between mb-2">
                <span className="text-black text-[9px] font-black uppercase tracking-widest opacity-40">White</span>
                <span className="text-xl text-black">☺</span>
              </div>
              <p className="text-neutral-500 font-black text-xs">提子: {gameState.captured.white}</p>
           </div>
           <button onClick={() => processPass()} disabled={gameState.gameOver || (isConnected && gameState.currentPlayer !== myColor)} className="w-full py-4 rounded-xl font-bold text-xs border border-white/10 hover:bg-white/5 active:scale-95 transition-all mt-auto uppercase">跳过 Skip</button>
           <button onClick={requestUndo} disabled={gameState.gameOver || gameState.history.length === 0 || isWaitingUndoResponse} className="w-full py-4 rounded-xl font-bold text-xs bg-indigo-900/20 border border-indigo-500/20 text-indigo-100 uppercase">悔棋 Undo</button>
        </aside>

        {/* 棋盘主区域：自适应核心 */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-0 relative">
           <div className="relative">
              <GoBoard 
                board={gameState.board} onMove={onBoardClick} currentPlayer={gameState.currentPlayer}
                disabled={gameState.gameOver || showUndoRequestModal} cellSize={cellSize}
                pendingMove={pendingMove} lastMove={gameState.lastMove}
              />
              
              {/* 弹窗：悔棋请求 */}
              {showUndoRequestModal && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl p-4 animate-fade-in">
                   <div className="bg-neutral-900 p-6 rounded-2xl border border-indigo-500/50 shadow-2xl flex flex-col items-center gap-4 text-center">
                      <p className="font-bold text-white uppercase tracking-wider">对方想悔棋</p>
                      <div className="flex gap-3 w-full min-w-[200px]">
                         <button onClick={() => respondToUndoRequest(false)} className="flex-1 bg-neutral-800 py-3 rounded-xl text-[10px] font-bold uppercase">拒绝</button>
                         <button onClick={() => respondToUndoRequest(true)} className="flex-1 bg-indigo-600 py-3 rounded-xl text-[10px] font-bold uppercase shadow-lg shadow-indigo-900/30">同意</button>
                      </div>
                   </div>
                </div>
              )}

              {/* 弹窗：对局结束 */}
              {gameState.gameOver && (
                <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-xl animate-fade-in">
                   <div className="bg-neutral-900 p-8 rounded-2xl border border-yellow-500/30 shadow-2xl flex flex-col items-center gap-4 text-center">
                      <h3 className="title-font text-3xl text-yellow-500 uppercase">对局结束</h3>
                      <p className="font-bold text-white tracking-widest">{gameState.winner === 'draw' ? '平局' : `${gameState.winner === 'black' ? '黑方' : '白方'} 胜`}</p>
                      <button onClick={() => resetGame()} className="bg-yellow-600 py-3 px-8 rounded-xl font-bold text-[10px] uppercase tracking-widest active:scale-95 shadow-lg shadow-yellow-900/30">重新开始</button>
                   </div>
                </div>
              )}

              {message && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-yellow-500 text-black px-6 py-2 rounded-full font-black text-[10px] uppercase shadow-2xl z-[120] animate-bounce">{message}</div>}
              {floatingEmoji && <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[130]"><span className="text-7xl animate-emoji-pop">{floatingEmoji.emoji}</span></div>}
           </div>
        </div>

        {/* 移动端操作栏 */}
        <div className="lg:hidden flex-none h-14 flex gap-2">
            <button onClick={() => processPass()} disabled={gameState.gameOver} className="flex-1 bg-neutral-800 rounded-xl font-bold text-[10px] uppercase active:scale-95">跳过一手</button>
            <button onClick={requestUndo} disabled={gameState.gameOver || gameState.history.length === 0} className="flex-1 bg-indigo-900/30 border border-indigo-500/20 rounded-xl font-bold text-[10px] uppercase active:scale-95">请求悔棋</button>
        </div>

        {/* 聊天和表情：固定高度自适应 */}
        <aside className="flex-none lg:w-72 flex flex-col gap-2 h-40 lg:h-auto overflow-hidden">
          <div className="flex-1 bg-neutral-900/30 rounded-xl border border-white/5 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 scrollbar-hide text-[11px]">
              {chatLog.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.color === 'spectator' ? 'items-center' : m.sender === (myColor === 'black' ? '黑方' : '白方') ? 'items-end' : 'items-start'}`}>
                  {m.color !== 'spectator' && <span className="text-[7px] text-gray-600 mb-0.5 px-1">{m.sender}</span>}
                  <div className={`px-3 py-1.5 rounded-xl ${m.color === 'spectator' ? 'text-gray-600 italic text-[9px]' : m.sender === (myColor === 'black' ? '黑方' : '白方') ? 'bg-indigo-600/60 text-white rounded-tr-none' : 'bg-neutral-800 text-white rounded-tl-none'} ${m.isEmoji ? 'text-2xl bg-transparent p-0' : 'border border-white/5 shadow-sm'}`}>{m.text}</div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            
            <div className="p-2 bg-black/20 border-t border-white/5 shrink-0 overflow-x-auto whitespace-nowrap flex gap-1.5 no-scrollbar">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => sendChat(e, true)} disabled={myEmojiCount >= 3} className={`text-lg transition-all ${myEmojiCount >= 3 ? 'grayscale opacity-5' : 'hover:scale-125'}`}>{e}</button>
              ))}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); sendChat(inputText); }} className="p-2 bg-black/40 flex gap-2 shrink-0">
              <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="消息..." className="flex-1 bg-white/5 border border-white/5 rounded-lg text-[10px] outline-none text-white px-3 py-1.5" />
              <button type="submit" className="bg-indigo-600 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all">发送</button>
            </form>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default App;
