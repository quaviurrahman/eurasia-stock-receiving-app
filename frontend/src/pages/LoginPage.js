import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, ShieldCheck, KeyRound } from "lucide-react";

const BG =
  "https://images.unsplash.com/photo-1740914994657-f1cdffdc418e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjd8MHwxfHNlYXJjaHwyfHxsb2dpc3RpY3MlMjB3YXJlaG91c2UlMjBtb2Rlcm58ZW58MHx8fHwxNzg2MTE1MzUyfDA&ixlib=rb-4.1.0&q=85";

const LoginPage = () => {
  const { user, login, staffLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@eurasia.com");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && user !== false) navigate("/", { replace: true });
  }, [user, navigate]);

  const submitAdmin = async (e) => {
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

  const submitStaff = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await staffLogin(pin.trim());
      toast.success(`Hi ${u.name}`);
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid PIN");
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
            <img src="/logo.jpg" alt="EurasiaStockIntake" className="w-11 h-11 rounded-full object-cover" />
            <span className="font-head font-black text-2xl tracking-tight">EurasiaStockIntake</span>
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
        <div className="w-full max-w-sm">
          <div className="md:hidden flex items-center gap-2 mb-8">
            <img src="/logo.jpg" alt="EurasiaStockIntake" className="w-9 h-9 rounded-full object-cover" />
            <span className="font-head font-black text-lg tracking-tight">EurasiaStockIntake</span>
          </div>

          <Tabs defaultValue="staff">
            <TabsList className="grid grid-cols-2 w-full rounded-sm h-11 mb-6">
              <TabsTrigger value="staff" data-testid="tab-staff-login">
                <KeyRound size={16} className="mr-2" /> Staff PIN
              </TabsTrigger>
              <TabsTrigger value="admin" data-testid="tab-admin-login">
                <ShieldCheck size={16} className="mr-2" /> Admin
              </TabsTrigger>
            </TabsList>

            <TabsContent value="staff">
              <form onSubmit={submitStaff} data-testid="staff-login-form">
                <h2 className="font-head font-bold text-2xl tracking-tight">Staff sign in</h2>
                <p className="text-sm text-muted-foreground mt-1 mb-6">
                  Enter your PIN to confirm deliveries.
                </p>
                <Label htmlFor="pin">Staff PIN</Label>
                <Input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="mt-1 h-12 rounded-sm tnum"
                  placeholder="••••"
                  data-testid="staff-pin"
                  required
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-sm mt-4 bg-accent text-accent-foreground hover:bg-accent/90 active:scale-95 transition-transform"
                  data-testid="staff-login-submit"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : "Enter"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="admin">
              <form onSubmit={submitAdmin} data-testid="admin-login-form">
                <h2 className="font-head font-bold text-2xl tracking-tight">Admin sign in</h2>
                <p className="text-sm text-muted-foreground mt-1 mb-6">
                  Manage receivals, suppliers and staff.
                </p>
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
                    className="w-full h-12 rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-transform"
                    data-testid="login-submit"
                  >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : "Sign in"}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
