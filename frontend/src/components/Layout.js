import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { ClipboardList, PlusSquare, Settings, LogOut, Boxes } from "lucide-react";

const NavBtn = ({ active, onClick, icon: Icon, label, testid }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className={`flex items-center gap-2 px-4 h-12 rounded-sm text-sm font-medium transition-colors active:scale-95 ${
      active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
    }`}
  >
    <Icon size={18} />
    <span>{label}</span>
  </button>
);

const Layout = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout } = useAuth();

  const nav = [
    { to: "/", label: "Receivals", icon: ClipboardList, testid: "nav-receivals" },
    { to: "/new", label: "New", icon: PlusSquare, testid: "nav-new" },
    { to: "/settings", label: "Admin", icon: Settings, testid: "nav-settings" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            data-testid="brand-home"
            className="flex items-center gap-2"
          >
            <div className="w-9 h-9 bg-primary text-primary-foreground flex items-center justify-center rounded-sm">
              <Boxes size={20} />
            </div>
            <div className="text-left leading-none">
              <div className="font-head font-black text-lg tracking-tight">EURASIA</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Goods Receival
              </div>
            </div>
          </button>

          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <NavBtn
                key={n.to}
                active={pathname === n.to}
                onClick={() => navigate(n.to)}
                icon={n.icon}
                label={n.label}
                testid={n.testid}
              />
            ))}
            <Button
              variant="ghost"
              onClick={logout}
              data-testid="logout-btn"
              className="h-12 rounded-sm"
            >
              <LogOut size={18} className="mr-2" /> Logout
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-24 md:pb-6">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t border-border grid grid-cols-4">
        {nav.map((n) => (
          <button
            key={n.to}
            data-testid={`${n.testid}-mobile`}
            onClick={() => navigate(n.to)}
            className={`flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-medium ${
              pathname === n.to ? "text-accent" : "text-muted-foreground"
            }`}
          >
            <n.icon size={20} />
            {n.label}
          </button>
        ))}
        <button
          data-testid="logout-btn-mobile"
          onClick={logout}
          className="flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-medium text-muted-foreground"
        >
          <LogOut size={20} />
          Logout
        </button>
      </nav>
    </div>
  );
};

export default Layout;
