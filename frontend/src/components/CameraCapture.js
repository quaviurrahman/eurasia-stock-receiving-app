import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, X, Aperture, Upload } from "lucide-react";
import { toast } from "sonner";

/**
 * Mobile-first camera capture that works reliably on iOS & Android.
 * - Uses getUserMedia with rear camera (facingMode: environment)
 * - Requires a user gesture ("Start camera") — needed by iOS Safari
 * - <video playsInline muted> — iOS refuses inline video otherwise
 * - Falls back to a native file input with capture="environment" when
 *   getUserMedia is unavailable (older iOS, in-app browsers, denied perms)
 */
const CameraCapture = ({ images, onCapture, onRemove }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Live camera not supported here — use ‘Upload from camera’.");
      fileInputRef.current?.click();
      return;
    }
    setStarting(true);
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        // fallback to any available camera (e.g. laptops / front cam)
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      setActive(true);
      // wait for React to render the <video> before attaching the stream
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      console.error("Camera error:", err);
      toast.error("Camera blocked. Allow camera access or use ‘Upload from camera’.");
    } finally {
      setStarting(false);
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.error("Camera still loading, try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.85));
    toast.success("Photo captured");
  };

  const onFile = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => onCapture(reader.result);
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-sm overflow-hidden bg-secondary">
        {active ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-64 object-cover bg-black"
            data-testid="camera-video"
          />
        ) : (
          <div className="w-full h-40 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Camera size={28} />
            <span className="text-sm">Camera is off</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!active ? (
          <Button
            type="button"
            onClick={startCamera}
            disabled={starting}
            className="h-12 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90 active:scale-95 transition-transform"
            data-testid="start-camera-btn"
          >
            <Camera size={18} className="mr-2" /> {starting ? "Starting…" : "Start camera"}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              onClick={capture}
              className="h-12 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90 active:scale-95 transition-transform"
              data-testid="capture-photo-btn"
            >
              <Aperture size={18} className="mr-2" /> Capture
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={stopCamera}
              className="h-12 rounded-sm active:scale-95 transition-transform"
              data-testid="stop-camera-btn"
            >
              <CameraOff size={18} className="mr-2" /> Stop
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="h-12 rounded-sm active:scale-95 transition-transform"
          data-testid="upload-camera-btn"
        >
          <Upload size={18} className="mr-2" /> Upload from camera
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onFile}
          className="hidden"
          data-testid="camera-file-input"
        />
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" data-testid="photo-grid">
          {images.map((img, idx) => (
            <div key={idx} className="relative border border-border rounded-sm overflow-hidden">
              <img src={img} alt={`capture-${idx}`} className="w-full h-24 object-cover" />
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="absolute top-1 right-1 w-6 h-6 bg-destructive text-destructive-foreground rounded-sm flex items-center justify-center"
                data-testid={`remove-photo-${idx}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CameraCapture;
