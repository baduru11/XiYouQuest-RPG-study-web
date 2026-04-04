import { LoginForm } from "./login-form";
import { Github } from "lucide-react";
import Image from "next/image";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 pb-24">
      <div className="flex flex-col items-center">
        <Image
          src="/img/background/Logo.webp"
          alt="XiYouQuest"
          width={450}
          height={150}
          priority
          className="drop-shadow-lg max-w-full h-auto"
        />
        <LoginForm />
      </div>
      <a
        href="https://github.com/baduru11/XiYouQuest-RPG-study-web"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 pixel-border bg-card/90 px-4 py-2 font-pixel text-sm text-foreground hover:text-primary hover:bg-card transition-colors"
      >
        <Github className="h-5 w-5" />
        View on GitHub
      </a>
    </div>
  );
}
