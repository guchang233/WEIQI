
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, PlayerColor, Point, NetworkMessage, ChatMessage, HistoryEntry } from './types';
import { GoRules, BOARD_SIZE } from './logic/GoRules';
import GoBoard from './components/GoBoard';

declare var Peer: any;

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
  
  // 核心功能：表情发送计数
  const [myEmojiCount, setMyEmojiCount] = useState(0);

  // 核心功能：悔棋握手状态
  const [isWaitingUndoResponse, setIsWaitingUndoResponse] = useState(false);
  const [showUndoRequestModal, setShowUndoRequestModal] = useState(false);

  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [floatingEmoji, setFloatingEmoji] = useState<{emoji: string, id: number} | null>(null);

  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 规则实现：每当棋盘历史发生变化（有人下棋或悔棋成功），重置表情计数
  useEffect(() => {
    setMyEmojiCount(0);
  }, [gameState.history.length]);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isDesktop = width >= 1024;
      const heightPadding = isDesktop ? 160 : 280;
      const widthPadding = isDesktop ? 400 : 40;
      const availableWidth = width - widthPadding;
      const availableHeight = height - heightPadding;
      const minDim = Math.min(availableWidth, availableHeight); 
      const idealSize = Math.floor(minDim / (BOARD_SIZE + 1.5));
      setCellSize(Math.max(16, Math.min(idealSize, 42)));
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
    const peer = new Peer();
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
    return () => peer.destroy();
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
    const conn = peerRef.current.connect(id);
    connRef.current = conn;
    setIsConnected(true);
    setMyColor('white');
    setView('game');
    setupConnection(conn);
  };

  const handleNetworkMessage = (msg: NetworkMessage) => {
    switch (msg.type) {
      case 'MOVE': executeMove(msg.payload, false); break;
      case 'PASS': processPass(false); break;
      case 'CHAT': receiveChat(msg.payload); break;
      
      // 核心功能：接收悔棋请求
      case 'UNDO_REQ': 
        setShowUndoRequestModal(true); 
        break;
      
      // 核心功能：对方同意悔棋
      case 'UNDO_ACCEPT': 
        performUndoAction(); 
        setIsWaitingUndoResponse(false); 
        setMessage("对方已同意悔棋");
        setTimeout(() => setMessage(''), 2000);
        break;
      
      // 核心功能：对方拒绝悔棋
      case 'UNDO_DECLINE': 
        setIsWaitingUndoResponse(false); 
        setMessage("对方拒绝了悔棋"); 
        setTimeout(() => setMessage(''), 2000); 
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
      setTimeout(() => setMessage(''), 1000);
      return;
    }
    if (gameState.board[p.y][p.x] !== null) return;

    if (pendingMove && pendingMove.x === p.x && pendingMove.y === p.y) {
      executeMove(p, true);
      setPendingMove(null);
    } else {
      setPendingMove(p);
      setMessage('确认落子？');
    }
  };

  const executeMove = (p: Point, shouldSend: boolean = true) => {
    setGameState(prev => {
      const validation = GoRules.isValidMove(prev.board, p, prev.currentPlayer, prev.history.map(h => h.board));
      if (!validation.valid || !validation.newBoard) {
        if (shouldSend) {
          setMessage(validation.error === 'Suicide move is illegal' ? '不能自杀' : '无效');
          setTimeout(() => setMessage(''), 1500);
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
        if (prev.currentPlayer === 'black') { setFlashBlack(true); setTimeout(() => setFlashBlack(false), 600); }
        else { setFlashWhite(true); setTimeout(() => setFlashWhite(false), 600); }
      }

      if (shouldSend && connRef.current) {
        connRef.current.send({ type: 'MOVE', payload: p });
      }

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

  // 核心功能：发起悔棋请求
  const requestUndo = () => {
    if (gameState.history.length === 0 || gameState.gameOver || isWaitingUndoResponse) return;
    
    if (!isConnected) {
      performUndoAction();
      return;
    }

    setIsWaitingUndoResponse(true);
    addSystemMessage("你向对手发起了悔棋请求...");
    if (connRef.current) {
      connRef.current.send({ type: 'UNDO_REQ', payload: null });
    }
  };

  // 核心功能：响应悔棋请求
  const respondToUndoRequest = (agreed: boolean) => {
    setShowUndoRequestModal(false);
    if (!connRef.current) return;
    
    if (agreed) {
      performUndoAction();
      connRef.current.send({ type: 'UNDO_ACCEPT', payload: null });
      addSystemMessage("你同意了对方的悔棋。");
    } else {
      connRef.current.send({ type: 'UNDO_DECLINE', payload: null });
      addSystemMessage("你拒绝了对方的悔棋。");
    }
  };

  // 核心功能：执行物理撤销
  const performUndoAction = () => {
    setGameState(prev => {
      if (prev.history.length === 0) return prev;
      const lastHistory = prev.history[prev.history.length - 1];
      const newHistory = prev.history.slice(0, -1);
      
      return {
        ...prev,
        board: JSON.parse(lastHistory.board),
        captured: lastHistory.captured,
        currentPlayer: lastHistory.player,
        lastMove: lastHistory.lastMove,
        history: newHistory,
        passCount: 0,
      };
    });
    setMessage('');
  };

  const processPass = (shouldSend: boolean = true) => {
    if (gameState.gameOver) return;
    if (isConnected && gameState.currentPlayer !== myColor && shouldSend) {
      setMessage("还没轮到你");
      setTimeout(() => setMessage(''), 1000);
      return;
    }

    setGameState(prev => {
      const nextPassCount = prev.passCount + 1;
      const isGameOver = nextPassCount >= 2;
      const nextPlayer = prev.currentPlayer === 'black' ? 'white' : 'black';
      
      let winnerInfo: any = null;
      if (isGameOver) {
        let blackStones = 0; let whiteStones = 0;
        prev.board.forEach(row => row.forEach(cell => {
          if (cell === 'black') blackStones++;
          if (cell === 'white') whiteStones++;
        }));
        const blackTotal = blackStones + prev.captured.black;
        const whiteTotal = whiteStones + prev.captured.white;
        winnerInfo = blackTotal > whiteTotal ? 'black' : blackTotal < whiteTotal ? 'white' : 'draw';
      }

      if (shouldSend && connRef.current) connRef.current.send({ type: 'PASS', payload: null });
      
      const playerName = prev.currentPlayer === 'black' ? '黑方' : '白方';
      addSystemMessage(isGameOver ? "双方跳过，对局结束！" : `${playerName} 跳过了一手。`);

      return { 
        ...prev, 
        currentPlayer: nextPlayer, 
        passCount: nextPassCount, 
        gameOver: isGameOver, 
        lastMove: null,
        winner: winnerInfo || null
      };
    });
  };

  const resetGame = (shouldSend: boolean = true) => {
    const freshState: GameState = {
      board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)),
      currentPlayer: 'black',
      captured: { black: 0, white: 0 },
      history: [],
      passCount: 0,
      gameOver: false,
      winner: null,
      lastMove: null,
    };
    setGameState(freshState);
    setMyEmojiCount(0);
    setMessage('对局已重置');
    addSystemMessage("--- 游戏重新开始 ---");
    if (shouldSend && connRef.current) {
      connRef.current.send({ type: 'RESTART', payload: null });
    }
  };

  const sendChat = (text: string, isEmoji = false) => {
    if (!text.trim()) return;

    // 核心规则：单个玩家单回合内发送三次表情后禁止发送
    if (isEmoji) {
      if (myEmojiCount >= 3) {
        setMessage("本回合表情上限已达(3/3)");
        setTimeout(() => setMessage(''), 1500);
        return;
      }
      setMyEmojiCount(prev => prev + 1);
    }

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: myColor === 'black' ? '黑方' : myColor === 'white' ? '白方' : '观战',
      text,
      isEmoji,
      color: myColor as PlayerColor
    };
    setChatLog(prev => [...prev, newMsg]);
    if (isEmoji) {
      setFloatingEmoji({ emoji: text, id: Date.now() });
      setTimeout(() => setFloatingEmoji(null), 1500);
    }
    if (connRef.current) {
      connRef.current.send({ type: 'CHAT', payload: newMsg });
    }
    if (!isEmoji) setInputText('');
  };

  const receiveChat = (msg: ChatMessage) => {
    setChatLog(prev => [...prev, msg]);
    if (msg.isEmoji) {
      setFloatingEmoji({ emoji: msg.text, id: Date.now() });
      setTimeout(() => setFloatingEmoji(null), 1500);
    }
  };

  if (view === 'lobby') {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center p-6 text-white">
        <div className="w-full max-w-sm bg-neutral-900/90 backdrop-blur-3xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl flex flex-col gap-6">
          <div className="text-center">
            <h1 className="title-font text-5xl text-yellow-500 mb-2">Q弹围棋</h1>
            <p className="text-gray-500 text-[10px] font-black tracking-[0.4em] uppercase">Blob Multi-player Go</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase px-1">我的连接 ID</label>
            <div onClick={() => { navigator.clipboard.writeText(peerId); alert('已复制 ID'); }} className="bg-black/50 border border-white/5 rounded-2xl p-4 text-[11px] font-mono text-gray-400 cursor-pointer hover:bg-black/70 flex items-center justify-between transition-all">
               <span className="truncate mr-2">{peerId || '获取中...'}</span>
               <span>📋</span>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button onClick={() => setView('game')} className="w-full bg-yellow-600 hover:bg-yellow-500 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95">单机演练</button>
            <div className="h-px bg-white/5 my-1" />
            <div className="flex gap-2">
              <input type="text" placeholder="好友 ID..." className="flex-1 bg-black/50 border border-white/5 rounded-2xl p-4 text-xs outline-none focus:border-yellow-500/50 text-white" value={remotePeerId} onChange={(e) => setRemotePeerId(e.target.value)} />
              <button onClick={() => connectToPeer(remotePeerId)} className="bg-indigo-600 hover:bg-indigo-500 px-6 rounded-2xl font-bold text-xs active:scale-95 transition-all">连接</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col items-center bg-[#0a0a0a] p-3 gap-3 text-white overflow-hidden select-none">
      {/* 顶部标题栏 */}
      <div className="w-full max-w-6xl flex items-center justify-between px-6 py-3 bg-neutral-900/80 rounded-3xl border border-white/5 shadow-lg backdrop-blur-md">
        <button onClick={() => setView('lobby')} className="text-gray-500 hover:text-white text-[11px] font-black tracking-widest transition-colors uppercase">‹ 返回大厅</button>
        <div className="flex flex-col items-center">
           <h2 className="title-font text-2xl text-yellow-500 leading-none">Q弹围棋</h2>
           <span className="text-[8px] text-gray-600 font-bold uppercase mt-1">{isConnected ? `联机中` : '本地模式'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="text-[10px] font-black text-gray-500 uppercase">{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-[1400px] justify-center flex-1 overflow-hidden px-4">
        {/* 左侧控制栏 */}
        <div className="hidden lg:flex flex-col gap-3 w-48 shrink-0">
           <div className={`p-5 rounded-[2rem] border-2 transition-all duration-500 ${gameState.currentPlayer === 'black' ? 'bg-black border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'bg-neutral-900/50 border-transparent opacity-30'} ${flashBlack ? 'animate-flash' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest">Black</span>
                <span className="text-2xl">☻</span>
              </div>
              <div className="text-yellow-500 text-xs font-black">提子: {gameState.captured.black}</div>
           </div>
           <div className={`p-5 rounded-[2rem] border-2 transition-all duration-500 ${gameState.currentPlayer === 'white' ? 'bg-white border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'bg-neutral-900/50 border-transparent opacity-30'} ${flashWhite ? 'animate-flash' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-black text-[10px] font-black uppercase tracking-widest">White</span>
                <span className="text-2xl text-black">☺</span>
              </div>
              <div className="text-neutral-500 text-xs font-black">提子: {gameState.captured.white}</div>
           </div>
           
           <div className="mt-auto flex flex-col gap-3">
              <button 
                disabled={gameState.gameOver || gameState.history.length === 0 || isWaitingUndoResponse}
                onClick={requestUndo} 
                className={`w-full font-black py-4 rounded-2xl transition-all active:scale-95 text-[11px] border border-white/5 uppercase tracking-widest ${gameState.gameOver || gameState.history.length === 0 || isWaitingUndoResponse ? 'bg-neutral-900 text-gray-700 cursor-not-allowed' : 'bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-200'}`}
              >
                {isWaitingUndoResponse ? '请求悔棋中...' : '申请悔棋 Undo'}
              </button>
              <button 
                disabled={gameState.gameOver || (isConnected && gameState.currentPlayer !== myColor)}
                onClick={() => processPass()} 
                className={`w-full font-black py-5 rounded-2xl transition-all active:scale-95 text-[11px] border border-white/5 uppercase tracking-widest ${gameState.gameOver || (isConnected && gameState.currentPlayer !== myColor) ? 'bg-neutral-900 text-gray-700' : 'bg-neutral-800 hover:bg-neutral-700 text-white'}`}
              >
                跳过回合 Skip
              </button>
           </div>
        </div>

        {/* 棋盘主区 */}
        <div className="relative flex-1 flex flex-col items-center justify-center min-h-0">
           <div className="relative">
              <GoBoard 
                board={gameState.board} 
                onMove={onBoardClick} 
                currentPlayer={gameState.currentPlayer}
                disabled={gameState.gameOver || showUndoRequestModal}
                cellSize={cellSize}
                pendingMove={pendingMove}
                lastMove={gameState.lastMove}
              />
              
              {/* 悔棋确认弹窗 - 接收方显示 */}
              {showUndoRequestModal && (
                <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md rounded-[2rem] animate-fade-in p-6">
                   <div className="bg-neutral-900 p-8 rounded-[2.5rem] border-2 border-indigo-500 shadow-2xl flex flex-col items-center gap-6 text-center max-w-sm">
                      <div className="text-2xl font-black text-white uppercase">对手想悔棋</div>
                      <p className="text-xs text-gray-400 leading-relaxed">对手请求撤销上一步。如果你同意，局势将会回退。</p>
                      <div className="flex gap-4 w-full">
                         <button onClick={() => respondToUndoRequest(false)} className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-black py-4 rounded-2xl transition-all active:scale-95 uppercase text-[10px] tracking-widest">拒绝</button>
                         <button onClick={() => respondToUndoRequest(true)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-indigo-900/20 uppercase text-[10px] tracking-widest">同意</button>
                      </div>
                   </div>
                </div>
              )}

              {gameState.gameOver && (
                <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in rounded-[2rem]">
                   <div className="bg-neutral-900 p-12 rounded-[3rem] border-2 border-yellow-500 shadow-2xl flex flex-col items-center gap-6 text-center">
                      <h3 className="title-font text-4xl text-yellow-500 uppercase">对局结束</h3>
                      <div className="text-lg font-bold text-yellow-500">
                         {gameState.winner === 'draw' ? '平局' : `${gameState.winner === 'black' ? '黑方' : '白方'} 胜利！`}
                      </div>
                      <button 
                        onClick={() => resetGame()} 
                        className="mt-2 w-full bg-yellow-600 hover:bg-yellow-500 text-white font-black py-4 px-12 rounded-2xl transition-all active:scale-95 uppercase text-xs tracking-widest"
                      >
                        重新对局
                      </button>
                   </div>
                </div>
              )}

              {floatingEmoji && (
                <div key={floatingEmoji.id} className="absolute inset-0 flex items-center justify-center pointer-events-none z-[100]">
                  <span className="text-8xl animate-emoji-pop">{floatingEmoji.emoji}</span>
                </div>
              )}
              
              {message && (
                <div key={message} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-yellow-500 text-black px-10 py-3 rounded-full font-black text-[11px] uppercase tracking-widest shadow-2xl z-[300] pointer-events-none">
                    {message}
                </div>
              )}
           </div>
        </div>

        {/* 右侧聊天栏 */}
        <div className="w-full lg:w-80 flex flex-col gap-3 shrink-0 h-[250px] lg:h-auto overflow-hidden">
          <div className="flex-1 bg-neutral-900/50 rounded-[2.5rem] border border-white/5 flex flex-col overflow-hidden backdrop-blur-xl shadow-xl">
            <div className="bg-white/5 px-5 py-3 border-b border-white/5 flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">聊天/记录</span>
              <span className="text-[9px] font-bold text-gray-600 italic">STEP {gameState.history.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 scrollbar-hide">
              {chatLog.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.color === 'spectator' ? 'items-center' : msg.sender === (myColor === 'black' ? '黑方' : '白方') ? 'items-end' : 'items-start'}`}>
                  {msg.color !== 'spectator' && <span className="text-[9px] text-gray-600 mb-0.5 px-1 font-bold">{msg.sender}</span>}
                  <div className={`px-4 py-2.5 rounded-2xl text-[12px] max-w-[90%] leading-relaxed ${
                    msg.color === 'spectator' ? 'bg-transparent text-gray-500 italic text-[10px] text-center' :
                    msg.sender === (myColor === 'black' ? '黑方' : '白方') ? 'bg-indigo-600 text-white rounded-tr-none' : 
                    'bg-neutral-800 text-white rounded-tl-none'
                  } ${msg.isEmoji ? 'text-4xl bg-transparent p-0' : 'shadow-sm'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            
            {/* 表情限制器界面 */}
            <div className="p-4 bg-white/5 flex flex-col gap-2">
                <div className="flex justify-between items-center px-1">
                    <span className="text-[9px] text-gray-500 uppercase font-black">本手表情限制</span>
                    <span className={`text-[10px] font-black ${myEmojiCount >= 3 ? 'text-red-500' : 'text-gray-300'}`}>{myEmojiCount} / 3</span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {EMOJIS.map(e => (
                    <button 
                        key={e} 
                        onClick={() => sendChat(e, true)} 
                        disabled={myEmojiCount >= 3}
                        className={`text-xl transition-all ${myEmojiCount >= 3 ? 'grayscale opacity-20 cursor-not-allowed' : 'hover:scale-150 active:scale-90'}`}
                        title={myEmojiCount >= 3 ? "本回合已达上限" : ""}
                    >
                      {e}
                    </button>
                  ))}
                </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); sendChat(inputText); }} className="p-4 bg-black/40 flex gap-2">
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="在此交流..."
                className="flex-1 bg-transparent border-none text-[12px] outline-none text-white px-2 placeholder:text-gray-700"
              />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-xl text-[10px] font-black transition-all active:scale-95 uppercase tracking-tighter">
                发送
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
