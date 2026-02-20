import { LoginForm } from "./login-form";
import { AlertCircle } from "lucide-react";
import { Github } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <LoginForm />
      <a
        href="https://github.com/baduru11/XiYouQuest-RPG-study-web"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 pixel-border bg-card/90 px-4 py-2 font-pixel text-sm text-foreground hover:text-primary hover:bg-card transition-colors"
      >
        <Github className="h-5 w-5" />
        View on GitHub
      </a>
      <div className="absolute right-4 top-4 md:right-8 md:top-auto md:bottom-8 w-96 pixel-border bg-card/80 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
          <span className="font-pixel text-base text-amber-500">In Development</span>
        </div>
        <div className="chinese-divider" />
        <div className="space-y-2">
          <p className="font-pixel text-sm text-muted-foreground">Test Account</p>
          <p className="font-retro text-2xl text-foreground">
            Email: <span className="text-primary">admin@email.com</span>
          </p>
          <p className="font-retro text-2xl text-foreground">
            Password: <span className="text-primary">admin1234</span>
          </p>
        </div>
      </div>
    </div>
  );
}
