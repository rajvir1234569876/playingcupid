import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = "https://playingcupid.vercel.app";

interface QRCodeCardProps {
  eventCode: string;
}

export function QRCodeCard({ eventCode }: QRCodeCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const joinUrl = `${BASE_URL}/join?code=${eventCode}`;

  const handleDownload = () => {
    const canvas = containerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;

    const W = 800, H = 1040;
    const poster = document.createElement("canvas");
    poster.width = W;
    poster.height = H;
    const ctx = poster.getContext("2d")!;

    // cream background
    ctx.fillStyle = "#FBF3E0";
    ctx.fillRect(0, 0, W, H);

    // thick dark border
    ctx.strokeStyle = "#1A1A1A";
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, W - 14, H - 14);

    // "playing cupid" title
    ctx.fillStyle = "#DC1019";
    ctx.font = "bold 76px serif";
    ctx.textAlign = "center";
    ctx.fillText("playing cupid", W / 2, 108);

    // subtitle
    ctx.fillStyle = "#1A1A1A";
    ctx.font = "34px sans-serif";
    ctx.fillText("scan to join", W / 2, 158);

    // white box behind QR
    const qrSize = 520;
    const qrX = (W - qrSize) / 2;
    const qrY = 200;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(qrX - 14, qrY - 14, qrSize + 28, qrSize + 28);
    ctx.strokeStyle = "#1A1A1A";
    ctx.lineWidth = 5;
    ctx.strokeRect(qrX - 14, qrY - 14, qrSize + 28, qrSize + 28);

    // draw QR (upscaled from hi-res canvas)
    ctx.drawImage(canvas, qrX, qrY, qrSize, qrSize);

    // event code
    ctx.fillStyle = "#1A1A1A";
    ctx.font = "bold 56px monospace";
    ctx.fillText(eventCode, W / 2, qrY + qrSize + 82);

    // URL
    ctx.fillStyle = "#555555";
    ctx.font = "22px monospace";
    ctx.fillText(`playingcupid.vercel.app/join?code=${eventCode}`, W / 2, qrY + qrSize + 130);

    const a = document.createElement("a");
    a.href = poster.toDataURL("image/png");
    a.download = `playingcupid-${eventCode}.png`;
    a.click();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card p-6 flex flex-col items-center gap-5">
      <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Scan to Join
      </p>

      {/* QR code — rendered at 600px for download quality, displayed at 256px via CSS */}
      <div
        className="p-4 bg-white border-[3px] border-border rounded-sm shadow-card"
        style={{ lineHeight: 0 }}
      >
        <div ref={containerRef} style={{ width: 256, height: 256, overflow: "hidden" }}>
          <QRCodeCanvas
            value={joinUrl}
            size={600}
            bgColor="#ffffff"
            fgColor="#1a1a1a"
            level="M"
            style={{ width: "256px", height: "256px", display: "block" }}
          />
        </div>
      </div>

      {/* Raw link + copy */}
      <div className="flex items-center gap-2 w-full">
        <code className="flex-1 min-w-0 text-xs bg-background/50 border border-border rounded-sm px-3 py-2 truncate font-mono">
          {joinUrl}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="shrink-0 gap-1.5"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {/* Download poster */}
      <Button
        onClick={handleDownload}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-button"
      >
        <Download className="w-4 h-4" />
        Download QR
      </Button>
    </div>
  );
}
