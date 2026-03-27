import { BookText } from "lucide-react";
import { LoginForm } from "./login-form";

const quotes = [
  { text: "A reader lives a thousand lives before he dies. The man who never reads lives only one.", author: "George R.R. Martin" },
  { text: "So many books, so little time.", author: "Frank Zappa" },
  { text: "A room without books is like a body without a soul.", author: "Marcus Tullius Cicero" },
  { text: "There is no friend as loyal as a book.", author: "Ernest Hemingway" },
  { text: "Until I feared I would lose it, I never loved to read. One does not love breathing.", author: "Harper Lee" },
  { text: "I have always imagined that Paradise will be a kind of library.", author: "Jorge Luis Borges" },
  { text: "Reading is to the mind what exercise is to the body.", author: "Joseph Addison" },
  { text: "The only thing that you absolutely have to know, is the location of the library.", author: "Albert Einstein" },
  { text: "Think before you speak. Read before you think.", author: "Fran Lebowitz" },
  { text: "Sleep is good, he said, and books are better.", author: "George R.R. Martin" },
];

export default function LoginPage() {
  const quote = quotes[Math.floor(Math.random() * quotes.length)];

  return (
    <div className="grid h-full lg:grid-cols-2">
      {/* Left panel — branding */}
      <div className="relative hidden flex-col justify-between bg-muted p-10 text-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-medium tracking-tight">
          <BookText className="size-6" />
          XTLibre
        </div>
        <blockquote>
          <p className="text-lg leading-relaxed">
            &ldquo;{quote.text}&rdquo; <span className="text-sm text-muted-foreground">&mdash; {quote.author}</span>
          </p>
        </blockquote>
      </div>

      {/* Right panel — login form */}
      <LoginForm />
    </div>
  );
}
