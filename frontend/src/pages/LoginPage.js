import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Boxes, Loader2 } from "lucide-react";

const BG = "https://images.unsplash.com/photo-1740914994657-f1cdffdc418e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjd8MHwxfHNlYXJjaHwyfHxsb2dpc3RpY3MlMjB3YXJlaG91c2UlMjBtb2Rlcm58ZW58MHx8fHwxNzg2MTE1MzUyfDA&ixlib=rb-4.1.0&q=85";

const LoginPage = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@eurasia.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && user !== false) navigate("/", { replace: true });
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success("Welcome back");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:block relative bg-primary">
        <img src={BG} alt="Warehouse" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-primary/40" />
        <div className="relative z-10 p-12 h-full flex flex-col justify-between text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-foreground text-primary flex items-center justify-center rounded-sm">
              <Boxes size={22} />
            </div>
            <span className="font-head font-black text-2xl tracking-tight">EURASIA</span>
          </div>
          <div>
            <h1 className="font-head font-black text-5xl leading-[0.95] tracking-tight">
              Goods Receival<br />Confirmation
            </h1>
            <p className="mt-4 text-sm max-w-sm text-primary-foreground/80">
              Capture deliveries, photos and signatures on the warehouse floor — from any phone.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="login-form">
          <div className="md:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 bg-primary text-primary-foreground flex items-center justify-center rounded-sm">
              <Boxes size={20} />
            </div>
            <span className="font-head font-black text-xl tracking-tight">EURASIA</span>
          </div>
          <h2 className="font-head font-bold text-2xl tracking-tight">Admin sign in</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-6">Manage receivals, suppliers and staff.</p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 h-12 rounded-sm"
                data-testid="login-email"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 h-12 rounded-sm"
                data-testid="login-password"
                placeholder="Enter password"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90 active:scale-95 transition-transform"
              data-testid="login-submit"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : "Sign in"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
