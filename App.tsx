
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, PlayerColor, Point, NetworkMessage, ChatMessage } from './types';
import { GoRules, BOARD_SIZE } from './logic/GoRules';
import GoBoard from './components/GoBoard';

declare var Peer: any;

const EMOJIS = ['😄', '😭', '😠', '😮', '💡', '⚡', '🔥', '👑'];

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
  const [connected, setConnected] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [cellSize, setCellSize] = useState<number>(20);
  const [pendingMove, setPendingMove] = useState<Point | null>(null);
  const [flashBlack, setFlashBlack] = useState(false);
  const [flashWhite, setFlashWhite] = useState(false);
  
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [floatingEmoji, setFloatingEmoji] = useState<{emoji: string, id: number} | null>(null);

  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const minDim = Math.min(width - 40, height - 300); 
      const idealSize = Math.floor(minDim / (BOARD_SIZE + 1));
      setCellSize(Math.max(14, Math.min(idealSize, 24)));
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
      setConnected(true);
      setMyColor('black');
      setView('game');
      setupConnection(conn);
      conn.send({ type: 'SYNC', payload: { gameState, chatLog } });
    });
    return () => peer.destroy();
  }, []);

  const setupConnection = (conn: any) => {
    conn.on('data', (data: NetworkMessage) => handleNetworkMessage(data));
    conn.on('close', () => { setConnected(false); addSystemMessage("对手已断开连接"); });
  };

  const connectToPeer = (id: string) => {
    if (!peerRef.current || !id) return;
    const conn = peerRef.current.connect(id);
    connRef.current = conn;
    setConnected(true);
    setMyColor('white');
    setView('game');
    setupConnection(conn);
  };

  const handleNetworkMessage = (msg: any) => {
    switch (msg.type) {
      case 'MOVE': executeMove(msg.payload, false); break;
      case 'PASS': processPass(false); break;
      case 'CHAT': receiveChat(msg.payload); break;
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
    if (gameState.gameOver) return;
    if (connected && gameState.currentPlayer !== myColor) {
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
    const validation = GoRules.isValidMove(gameState.board, p, gameState.currentPlayer, gameState.history);
    if (validation.valid && validation.newBoard) {
      const nextPlayer = gameState.currentPlayer === 'black' ? 'white' : 'black';
      const updatedCaptured = { ...gameState.captured };
      const capturedDelta = validation.captured || 0;
      updatedCaptured[gameState.currentPlayer] += capturedDelta;

      if (capturedDelta > 0) {
        if (gameState.currentPlayer === 'black') { setFlashBlack(true); setTimeout(() => setFlashBlack(false), 600); }
        else { setFlashWhite(true); setTimeout(() => setFlashWhite(false), 600); }
      }

      const newState: GameState = {
        ...gameState,
        board: validation.newBoard,
        currentPlayer: nextPlayer,
        captured: updatedCaptured,
        history: [...gameState.history, JSON.stringify(validation.newBoard)],
        passCount: 0,
        lastMove: p,
      };

      setGameState(newState);
      setMessage('');
      if (shouldSend && connRef.current) {
        connRef.current.send({ type: 'MOVE', payload: p });
      }
    } else {
      setMessage(validation.error === 'Suicide move is illegal' ? '不能自杀' : '无效');
      setTimeout(() => setMessage(''), 1500);
    }
  };

  const calculateWinner = (state: GameState) => {
    let blackStones = 0;
    let whiteStones = 0;
    state.board.forEach(row => row.forEach(cell => {
      if (cell === 'black') blackStones++;
      if (cell === 'white') whiteStones++;
    }));
    const blackTotal = blackStones + state.captured.black;
    const whiteTotal = whiteStones + state.captured.white;
    return {
      blackTotal,
      whiteTotal,
      winner: blackTotal > whiteTotal ? 'black' : blackTotal < whiteTotal ? 'white' : 'draw'
    };
  };

  const processPass = (shouldSend: boolean = true) => {
    if (gameState.gameOver) return;
    
    if (connected && gameState.currentPlayer !== myColor && shouldSend) {
      setMessage("还没轮到你");
      setTimeout(() => setMessage(''), 1000);
      return;
    }

    const nextPassCount = gameState.passCount + 1;
    const isGameOver = nextPassCount >= 2;
    const nextPlayer = gameState.currentPlayer === 'black' ? 'white' : 'black';
    
    let winnerInfo: any = null;
    if (isGameOver) {
      winnerInfo = calculateWinner(gameState);
    }

    const newState: GameState = { 
      ...gameState, 
      currentPlayer: nextPlayer, 
      passCount: nextPassCount, 
      gameOver: isGameOver, 
      lastMove: null,
      winner: winnerInfo?.winner || null
    };
    
    setGameState(newState);
    
    const playerName = gameState.currentPlayer === 'black' ? '黑方' : '白方';
    if (!isGameOver) {
      addSystemMessage(`${playerName} 跳过了一手。如果对方接着跳过，对局将结束。`);
    } else {
      addSystemMessage(`双方连续跳过，对局结束！`);
    }
    
    if (shouldSend && connRef.current) connRef.current.send({ type: 'PASS' });
  };

  const resetGame = (shouldSend: boolean = true) => {
    const newState: GameState = {
      board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)),
      currentPlayer: 'black',
      captured: { black: 0, white: 0 },
      history: [],
      passCount: 0,
      gameOver: false,
      winner: null,
      lastMove: null,
    };
    setGameState(newState);
    setMessage('新对局开始');
    addSystemMessage("--- 开启了新对局 ---");
    setTimeout(() => setMessage(''), 2000);
    if (shouldSend && connRef.current) {
      connRef.current.send({ type: 'RESTART' });
    }
  };

  const sendChat = (text: string, isEmoji = false) => {
    if (!text.trim()) return;
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
      <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center p-6 text-white relative">
        <div className="z-10 w-full max-w-sm bg-neutral-900/90 backdrop-blur-3xl p-8 rounded-[2rem] border border-white/5 shadow-2xl flex flex-col gap-6 ring-1 ring-white/10">
          <div className="text-center">
            <h1 className="title-font text-4xl text-yellow-500 mb-1">Q弹围棋</h1>
            <p className="text-gray-500 text-[9px] font-black tracking-[0.3em] uppercase">Blob Physics Weiqi</p>
          </div>
          <div className="space-y-4">
             <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-gray-500 uppercase px-1">我的 ID</label>
                <div onClick={() => { navigator.clipboard.writeText(peerId); alert('ID 已复制'); }} className="bg-black/50 border border-white/5 rounded-xl p-3 text-[10px] font-mono text-gray-400 cursor-pointer hover:bg-black/70 truncate flex items-center justify-between transition-colors">
                   <span>{peerId || '正在连接...'}</span>
                   <span className="text-gray-600 text-[12px]">📋</span>
                </div>
             </div>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => setView('game')} className="w-full bg-yellow-600 hover:bg-yellow-500 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-yellow-900/20">本地开始</button>
            <div className="flex gap-2 mt-2">
              <input type="text" placeholder="输入好友 ID..." className="flex-1 bg-black/50 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-yellow-500/50 transition-colors text-white" value={remotePeerId} onChange={(e) => setRemotePeerId(e.target.value)} />
              <button onClick={() => connectToPeer(remotePeerId)} className="bg-indigo-600 hover:bg-indigo-500 px-5 rounded-xl font-bold text-xs active:scale-95 transition-all uppercase tracking-tighter">联机</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const score = calculateWinner(gameState);

  return (
    <div className="h-screen flex flex-col items-center bg-[#0a0a0a] p-2 gap-2 select-none overflow-hidden text-white">
      {/* Header */}
      <div className="w-full max-w-4xl flex items-center justify-between px-4 py-2 bg-neutral-900/80 rounded-xl border border-white/5 shadow-lg backdrop-blur-md">
        <button onClick={() => setView('lobby')} className="text-gray-500 hover:text-white text-[10px] font-black tracking-tighter transition-colors">‹ 退出</button>
        <h2 className="title-font text-base text-yellow-500">Q弹围棋</h2>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 shadow-[0_0_5px_green]' : 'bg-red-500 opacity-30'}`}></div>
          <span className="text-[8px] font-black text-gray-500 uppercase">{connected ? '已联机' : '离线模式'}</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 w-full max-w-6xl justify-center flex-1 overflow-hidden">
        {/* Left Stats */}
        <div className="hidden lg:flex flex-col gap-2 w-32 shrink-0">
           <div className={`p-3 rounded-xl border-2 transition-all duration-500 ${gameState.currentPlayer === 'black' ? 'bg-black border-yellow-500 shadow-xl' : 'bg-neutral-900 border-transparent opacity-20'} ${flashBlack ? 'animate-flash' : ''}`}>
              <div className="flex items-center justify-between mb-1"><span className="text-[9px] font-black uppercase tracking-widest">Black</span><span className="text-lg">☻</span></div>
              <div className={`text-yellow-500 text-[10px] font-black leading-none`}>提子: {gameState.captured.black}</div>
           </div>
           <div className={`p-3 rounded-xl border-2 transition-all duration-500 ${gameState.currentPlayer === 'white' ? 'bg-white border-yellow-500 shadow-xl' : 'bg-neutral-900 border-transparent opacity-20'} ${flashWhite ? 'animate-flash' : ''}`}>
              <div className="flex items-center justify-between mb-1"><span className="text-black text-[9px] font-black uppercase tracking-widest">White</span><span className="text-lg text-black">☺</span></div>
              <div className={`text-neutral-500 text-[10px] font-black leading-none`}>提子: {gameState.captured.white}</div>
           </div>
           
           <button 
             disabled={gameState.gameOver}
             onClick={() => processPass()} 
             className={`mt-auto w-full font-black py-4 rounded-xl transition-all active:scale-95 text-[11px] border border-white/5 uppercase tracking-widest ${gameState.gameOver ? 'bg-neutral-900 text-gray-700' : 'bg-neutral-800 hover:bg-neutral-700 text-white'}`}
           >
             {gameState.passCount === 1 ? '确认结束 Skip' : '跳过 Skip'}
           </button>
        </div>

        {/* Center Board */}
        <div className="relative flex-1 flex flex-col items-center justify-center min-h-0">
           <div className="relative">
              <GoBoard 
                board={gameState.board} 
                onMove={onBoardClick} 
                currentPlayer={gameState.currentPlayer}
                disabled={gameState.gameOver}
                cellSize={cellSize}
                pendingMove={pendingMove}
                lastMove={gameState.lastMove}
              />
              
              {/* 对局结束结算窗口 */}
              {gameState.gameOver && (
                <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in rounded-2xl">
                   <div className="bg-neutral-900 p-8 rounded-[2rem] border-2 border-yellow-500/30 shadow-2xl flex flex-col items-center gap-4 text-center">
                      <h3 className="title-font text-2xl text-yellow-500 uppercase tracking-widest">对局结束</h3>
                      <div className="flex gap-8 my-2">
                        <div className="flex flex-col">
                           <span className="text-[10px] text-gray-500 font-black uppercase">黑方得分</span>
                           <span className="text-3xl font-black">{score.blackTotal}</span>
                        </div>
                        <div className="flex flex-col">
                           <span className="text-[10px] text-gray-500 font-black uppercase">白方得分</span>
                           <span className="text-3xl font-black text-white/50">{score.whiteTotal}</span>
                        </div>
                      </div>
                      <div className="text-sm font-bold text-yellow-500">
                         {score.winner === 'draw' ? '握手言和！' : `${score.winner === 'black' ? '黑方' : '白方'} 获得了胜利！`}
                      </div>
                      <button 
                        onClick={() => resetGame()} 
                        className="mt-2 w-full bg-yellow-600 hover:bg-yellow-500 text-white font-black py-3 px-8 rounded-xl transition-all active:scale-95 shadow-lg shadow-yellow-900/20 uppercase text-xs tracking-widest"
                      >
                        再来一局 Rematch
                      </button>
                   </div>
                </div>
              )}

              {/* 浮动表情动画 */}
              {floatingEmoji && (
                <div key={floatingEmoji.id} className="absolute inset-0 flex items-center justify-center pointer-events-none z-[100]">
                  <span className="text-6xl animate-bounce-in">{floatingEmoji.emoji}</span>
                </div>
              )}
              {/* 游戏内提示消息 */}
              {message && (
                <div key={message} className="absolute top-1/2 left-1/2 bg-yellow-500 text-black px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl animate-bubble-fade z-[60] pointer-events-none">
                    {message}
                </div>
              )}
           </div>
           
           {/* Mobile Controls */}
           <div className="lg:hidden flex w-full max-w-[400px] gap-2 mt-4">
              <div className={`flex-1 p-2 rounded-lg border text-center ${gameState.currentPlayer === 'black' ? 'bg-black border-yellow-500' : 'bg-neutral-900 border-transparent opacity-30'}`}>
                <span className="text-[9px] block">黑方 ☻</span>
                <span className="text-[10px] font-black text-yellow-500">{gameState.captured.black}</span>
              </div>
              <button 
                disabled={gameState.gameOver}
                onClick={() => processPass()} 
                className={`flex-[2] py-2 rounded-lg font-black text-[10px] uppercase tracking-widest ${gameState.gameOver ? 'bg-neutral-900 text-gray-700' : 'bg-neutral-800 text-white'}`}
              >
                {gameState.passCount === 1 ? '确认结束' : '跳过 Skip'}
              </button>
              <div className={`flex-1 p-2 rounded-lg border text-center ${gameState.currentPlayer === 'white' ? 'bg-white border-yellow-500' : 'bg-neutral-900 border-transparent opacity-30'}`}>
                <span className="text-[9px] block text-black">白方 ☺</span>
                <span className="text-[10px] font-black text-neutral-500">{gameState.captured.white}</span>
              </div>
           </div>
        </div>

        {/* Right Chat & Emojis */}
        <div className="w-full lg:w-64 flex flex-col gap-2 shrink-0 h-[200px] lg:h-auto overflow-hidden">
          <div className="flex-1 bg-neutral-900/50 rounded-2xl border border-white/5 flex flex-col overflow-hidden backdrop-blur-sm">
            <div className="bg-white/5 px-3 py-1.5 border-b border-white/5 flex justify-between items-center">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">聊天记录</span>
              <span className="text-[9px] text-gray-600">{chatLog.length} 条</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 scrollbar-hide">
              {chatLog.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.color === 'spectator' ? 'items-center' : msg.sender === (myColor === 'black' ? '黑方' : '白方') ? 'items-end' : 'items-start'}`}>
                  {msg.color !== 'spectator' && <span className="text-[8px] text-gray-500 mb-0.5">{msg.sender}</span>}
                  <div className={`px-2.5 py-1.5 rounded-2xl text-[11px] max-w-[90%] break-words ${
                    msg.color === 'spectator' ? 'bg-transparent text-gray-500 italic text-[9px] text-center' :
                    msg.sender === (myColor === 'black' ? '黑方' : '白方') ? 'bg-indigo-600 text-white rounded-tr-none' : 
                    'bg-neutral-800 text-white rounded-tl-none'
                  } ${msg.isEmoji ? 'text-2xl bg-transparent p-0' : ''}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            
            <div className="p-2 flex gap-1 justify-center border-t border-white/5 bg-white/5">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => sendChat(e, true)} className="text-lg hover:scale-125 transition-transform active:scale-95 duration-75">
                  {e}
                </button>
              ))}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); sendChat(inputText); }} className="p-2 bg-black/40 flex gap-2">
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="发送消息..."
                className="flex-1 bg-transparent border-none text-[11px] outline-none text-white px-2 placeholder:text-gray-600"
              />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded-lg text-[10px] font-bold transition-colors">
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
