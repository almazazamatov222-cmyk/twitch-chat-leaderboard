import LoginButton from '@/components/LoginButton';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-950 text-white">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm flex flex-col gap-8">
        <h1 className="text-5xl font-bold text-center tracking-tight">
          Интерактивный <span className="text-[#9146FF]">Топ Чата</span> для стримеров
        </h1>
        <p className="text-xl text-gray-400 text-center max-w-2xl">
          Считайте сообщения зрителей в реальном времени. Настраивайте дизайн под свой стрим. Добавляйте в OBS за пару кликов.
        </p>
        
        <div className="mt-8">
          <LoginButton />
        </div>
      </div>
      
      {/* Декоративный градиент на фоне */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-[#9146FF] opacity-10 blur-[120px] rounded-full pointer-events-none" />
    </main>
  );
}
