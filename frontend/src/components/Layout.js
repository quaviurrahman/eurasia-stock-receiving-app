import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { ClipboardList, PlusSquare, Settings, LogOut, UserRound, LayoutDashboard } from "lucide-react";

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
  const { logout, user, isAdmin } = useAuth();

  const nav = [
    { to: "/", label: "Receivals", icon: ClipboardList, testid: "nav-receivals" },
    { to: "/new", label: "New", icon: PlusSquare, testid: "nav-new" },
  ];
  if (isAdmin) {
    nav.push({ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" });
    nav.push({ to: "/settings", label: "Admin", icon: Settings, testid: "nav-settings" });
  }

  const cols = nav.length + 1;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} data-testid="brand-home" className="flex items-center gap-2">
            <img src="/logo.jpg" alt="EurasiaStockIntake" className="w-10 h-10 rounded-full object-cover border border-border" />
            <div className="text-left leading-none">
              <div className="font-head font-black text-base sm:text-lg tracking-tight">EurasiaStockIntake</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Goods Receival
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1">
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
            </nav>
            <div className="hidden sm:flex items-center gap-2 px-3 h-10 border border-border rounded-sm ml-1" data-testid="current-user">
              <UserRound size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="text-[10px] uppercase tracking-wide bg-secondary px-1.5 py-0.5 rounded-sm">
                {user?.role}
              </span>
            </div>
            <Button variant="ghost" onClick={logout} data-testid="logout-btn" className="hidden md:flex h-12 rounded-sm">
              <LogOut size={18} className="mr-2" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-6 pb-24 md:pb-6">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t border-border grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
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
