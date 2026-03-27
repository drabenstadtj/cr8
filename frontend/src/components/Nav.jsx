import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth, useConfig } from "../App.jsx";
import styles from "./Nav.module.css";

export default function Nav() {
    const { user, logout } = useAuth();
    const { navidromeUrl } = useConfig();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);

    function linkClass(path) {
        return `${styles.link} ${pathname === path ? styles.active : ""}`.trim();
    }

    function go(path) {
        navigate(path);
        setMenuOpen(false);
    }

    return (
        <nav className={styles.nav}>
            <span className={styles.logo}>cr8</span>
            <button
                className={styles.hamburger}
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Menu"
            >
                {menuOpen ? "×" : "☰"}
            </button>
            <div className={`${styles.links} ${menuOpen ? styles.linksOpen : ""}`}>
                <button className={linkClass("/")} onClick={() => go("/")}>
                    Home
                </button>
                <button
                    className={linkClass("/search")}
                    onClick={() => go("/search")}
                >
                    Search
                </button>
                <button
                    className={linkClass("/requests")}
                    onClick={() => go("/requests")}
                >
                    My requests
                </button>
                {user?.role === "ADMIN" && (
                    <button
                        className={linkClass("/admin")}
                        onClick={() => go("/admin")}
                    >
                        Admin
                    </button>
                )}
                {navidromeUrl && (
                    <a
                        className={styles.link}
                        href={navidromeUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setMenuOpen(false)}
                    >
                        Listen ↗
                    </a>
                )}
                <button className={styles.link} onClick={() => { logout(); setMenuOpen(false); }}>
                    Log out
                </button>
            </div>
        </nav>
    );
}
