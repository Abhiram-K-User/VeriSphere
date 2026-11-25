"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import {
  ArrowRight,
  Sun,
  Moon,
  User,
  CreditCard,
  LogOut,
  LogIn,
  ChevronDown,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/components/auth-provider";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { toast } from "sonner";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const { theme, setTheme, mounted } = useTheme();
  const { user, billing, logout } = useAuth();
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Verify Candidate", href: "/verify" },
    { name: "Dashboard", href: "/dashboard" },
    { name: "Pricing", href: "/pricing" },
    { name: "Profile", href: "/profile" },
  ];

  const handleSignOut = async () => {
    setMenuOpen(false);
    await logout();
    toast.success("Signed out safely.");
    router.push("/login");
  };

  const isLinkActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <motion.nav
      className="sticky top-0 z-50 h-[72px] flex items-center backdrop-blur-[16px] bg-[var(--bg-nav)] font-heading"
      animate={{
        borderBottomWidth: isScrolled ? 1 : 1,
        borderBottomColor: isScrolled ? "var(--border-strong)" : "var(--border)",
        boxShadow: isScrolled
          ? "0 1px 12px rgba(0,0,0,0.06), 0 0 0 1px var(--border-strong)"
          : "0 0 0 1px var(--border)",
      }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{ borderBottomStyle: "solid" }}
    >
      <div className="w-full max-w-[1280px] mx-auto px-8 flex items-center justify-between">
        
        {/* Left Section: Logo & Subtitle */}
        <Link href="/" className="flex items-center gap-3 select-none group">
          <motion.div
            whileHover={{ scale: 1.08, y: -2, rotate: -2, boxShadow: "var(--shadow-sm)" }}
            whileTap={{ scale: 0.95, y: 0, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center shadow-sm border border-[var(--border)] relative bg-white shrink-0"
          >
            <Image src="/logo.png" alt="VeriSphere Logo" width={48} height={48} className="object-contain w-full h-full scale-[2.2]" />
          </motion.div>
          <div className="flex flex-col">
            <div className="flex items-baseline leading-none">
              <span className="font-heading font-bold text-2xl text-[var(--brand-navy)] tracking-tight group-hover:text-[var(--brand-blue)] transition-colors duration-300">VeriSphere</span>
            </div>
            <span className="text-[11px] font-heading font-medium text-[var(--text-tertiary)] mt-1 tracking-wide uppercase">
              Candidate Verification Intelligence
            </span>
          </div>
        </Link>

        {/* Center Navigation */}
        <div className="flex items-center gap-1" onMouseLeave={() => setHoveredPath(null)}>
          {navLinks.map((link) => {
            const active = isLinkActive(link.href);
            const isHovered = hoveredPath === link.href;

            return (
              <Link
                key={link.name}
                href={link.href}
                onMouseEnter={() => setHoveredPath(link.href)}
                className={`relative px-4 py-2 text-[14px] font-heading rounded-full transition-colors duration-300 ${
                  active
                    ? "text-[var(--brand-blue)] font-semibold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium"
                }`}
              >
                {/* Hover background pill */}
                {isHovered && (
                  <motion.span
                    layoutId="navbar-hover"
                    className="absolute inset-0 bg-[var(--bg-subtle)] rounded-full -z-10"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  />
                )}

                <span className="relative z-10">{link.name}</span>

                {/* Sliding active indicator */}
                {active && (
                  <motion.span
                    layoutId="active-nav-indicator"
                    className="absolute bottom-[-16px] left-4 right-4 h-[3px] bg-[var(--brand-blue)] rounded-t-full z-10"
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right Section: CTA & Theme Toggle */}
        <div className="flex items-center gap-3">
          {/* Theme Toggle with icon flip animation */}
          <motion.button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-10 h-10 rounded-full flex items-center justify-center border border-[var(--border)] text-[var(--text-secondary)] relative overflow-hidden"
            whileHover={{ scale: 1.08, backgroundColor: "var(--bg-subtle)", color: "var(--text-primary)" }}
            whileTap={{ scale: 0.94 }}
            transition={{ duration: 0.15 }}
            aria-label="Toggle theme"
          >
            <AnimatePresence mode="wait" initial={false}>
              {!mounted ? (
                <span key="placeholder" className="w-[18px] h-[18px] opacity-0" />
              ) : theme === "dark" ? (
                <motion.span
                  key="sun"
                  initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <Sun size={18} />
                </motion.span>
              ) : (
                <motion.span
                  key="moon"
                  initial={{ rotate: 90, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: -90, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <Moon size={18} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          {/* Auth / Profile Control */}
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-colors"
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[var(--brand-blue)] text-white text-xs font-bold flex items-center justify-center">
                    {user.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="hidden xl:flex flex-col text-left leading-tight">
                  <span className="text-xs font-semibold text-[var(--text-primary)] max-w-[110px] truncate">
                    {user.name}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--brand-blue)]">
                    {user.accountType === "org" ? "ORG" : "IND"} · {billing.planName}
                  </span>
                </div>
                <ChevronDown size={14} className="text-[var(--text-tertiary)]" />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-60 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] shadow-xl py-2 z-50"
                  >
                    <div className="px-4 py-2.5 border-b border-[var(--border)]">
                      <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {user.name}
                      </div>
                      <div className="text-[11px] text-[var(--text-tertiary)] truncate">
                        {user.email}
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--brand-blue-light)] text-[var(--brand-blue)] text-[10px] font-bold uppercase">
                        {billing.planName} ·{" "}
                        {billing.credits === "Unlimited"
                          ? "∞ Credits"
                          : `${billing.credits} Credits`}
                      </div>
                    </div>

                    <div className="py-1">
                      <Link
                        href="/profile"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
                      >
                        <User size={14} />
                        <span>Profile & Plan Details</span>
                      </Link>
                      <Link
                        href="/pricing"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
                      >
                        <CreditCard size={14} />
                        <span>Upgrade Plan & Billing</span>
                      </Link>
                    </div>

                    <div className="pt-1 border-t border-[var(--border)]">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-bg)] text-left"
                      >
                        <LogOut size={14} />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors"
            >
              <LogIn size={14} />
              <span>Sign In</span>
            </Link>
          )}

          {/* CTA Button */}
          <motion.div
            whileHover={{ scale: 1.04, y: -2, boxShadow: "var(--shadow-sm)" }}
            whileTap={{ scale: 0.95, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <Link
              href="/verify"
              className="inline-flex items-center gap-1.5 bg-[var(--brand-blue)] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors duration-150"
            >
              <span>New Verification</span>
              <motion.span
                animate={{ x: [0, 3, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.8 }}
              >
                <ArrowRight size={15} strokeWidth={2.5} />
              </motion.span>
            </Link>
          </motion.div>
        </div>

      </div>
    </motion.nav>
  );
}
