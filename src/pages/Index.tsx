import { useNavigate } from "react-router-dom";
import { Users, Plus, Search } from "lucide-react";

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
    <div className="bg-[#C40E16] min-h-screen overflow-x-hidden">

      {/* ── Desktop layout ── */}
      <div className="hidden md:block relative h-screen overflow-hidden">
        {/* Cupid — anchored bottom-left, blends into background */}
        <img
          src="/cupid-hero-v2.png"
          alt=""
          aria-hidden="true"
          className="absolute bottom-0 left-8 h-[88vh] w-auto select-none pointer-events-none"
        />

        {/* Right panel — cards at binoculars height */}
        <div className="absolute right-0 top-0 h-full w-[46%] flex flex-col items-start justify-center pr-20 pl-2">
          <h1 className="font-serif text-4xl font-bold text-[#FFF5E6] mb-8 tracking-tight">
            playingcupid
          </h1>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            {cards.map(({ icon: Icon, title, subtitle, path }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="bg-[#FFF8EE] text-left border-[3px] border-[#1A0800] rounded-sm
                           shadow-[5px_5px_0px_#1A0800] p-5 flex items-center gap-4
                           hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0px_#1A0800]
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-[3px_3px_0px_#1A0800]
                           transition-all duration-100 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-[#C40E16] border-2 border-[#1A0800] flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-[#FFF8EE]" />
                </div>
                <div>
                  <h2 className="font-bold text-[15px] text-[#1A0800] leading-tight">{title}</h2>
                  <p className="text-[13px] text-[#4A1800] mt-0.5 leading-snug">{subtitle}</p>
                </div>
              </button>
            ))}
          </div>

          <p className="mt-6 text-xs text-[#FFF8EE]/50">
            trying to set u up, have fun - reniepce
          </p>
        </div>
      </div>

      {/* ── Mobile layout — cupid on top, cards below ── */}
      <div className="flex md:hidden flex-col min-h-screen">
        {/* Cupid image cropped to character area */}
        <div className="w-full" style={{ height: '44vh' }}>
          <img
            src="/cupid-hero-v2.png"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover object-center select-none pointer-events-none"
          />
        </div>

        {/* Cards section */}
        <div className="flex flex-col items-center px-5 pt-7 pb-10 flex-1">
          <h1 className="font-serif text-3xl font-bold text-[#FFF8EE] mb-6 tracking-tight">
            playingcupid
          </h1>

          <div className="flex flex-col gap-3 w-full max-w-sm">
            {cards.map(({ icon: Icon, title, subtitle, path }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="bg-[#FFF8EE] text-left border-[3px] border-[#1A0800] rounded-sm
                           shadow-[5px_5px_0px_#1A0800] p-5 flex items-center gap-4
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-[3px_3px_0px_#1A0800]
                           transition-all duration-100 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-[#C40E16] border-2 border-[#1A0800] flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-[#FFF8EE]" />
                </div>
                <div>
                  <h2 className="font-bold text-[15px] text-[#1A0800] leading-tight">{title}</h2>
                  <p className="text-[13px] text-[#4A1800] mt-0.5 leading-snug">{subtitle}</p>
                </div>
              </button>
            ))}
          </div>

          <p className="mt-auto pt-8 text-xs text-[#FFF8EE]/50 text-center">
            trying to set u up, have fun - reniepce
          </p>
        </div>
      </div>

    </div>
  );
}
