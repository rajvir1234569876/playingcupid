import { useNavigate } from "react-router-dom";
import { Heart, Users, Plus, Search } from "lucide-react";

const cards = [
  {
    icon: Users,
    title: "Join Event",
    subtitle: "Have a code? Jump in and find your match.",
    path: "/join",
  },
  {
    icon: Plus,
    title: "Create Event",
    subtitle: "Host a matchmaking night for your group.",
    path: "/admin",
  },
  {
    icon: Search,
    title: "Check Matches",
    subtitle: "Already attended? Look up who you matched with.",
    path: "/check-matches",
  },
];

export default function Index() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-3xl text-center">
        <div className="flex items-center justify-center mb-3">
          <Heart className="w-8 h-8 text-primary fill-primary" />
        </div>
        <h1 className="font-serif text-4xl font-bold text-primary mb-2">
          playingcupid
        </h1>
        <p className="text-lg text-primary mb-10">
          One event. One match. One moment.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cards.map(({ icon: Icon, title, subtitle, path }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="glass-card p-8 flex flex-col items-center gap-4 text-center hover:scale-[1.02] transition-transform cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-lg text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
              </div>
            </button>
          ))}
        </div>

        <p className="mt-12 text-xs text-muted-foreground/60">
          trying to set u up, have fun - reniepce
        </p>
      </div>
    </div>
  );
}
