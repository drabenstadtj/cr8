import { useNavigate, useLocation } from "react-router-dom";
import { useAuth, useConfig } from "../App.jsx";
import styles from "./Nav.module.css";

export default function Nav() {
    const { user, logout } = useAuth();
    const { navidromeUrl } = useConfig();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    function linkClass(path) {
        return `${styles.link} ${pathname === path ? styles.active : ""}`.trim();
    }

    return (
        <nav className={styles.nav}>
            <span className={styles.logo}>cr8</span>
            <button className={linkClass("/")} onClick={() => navigate("/")}>
                Home
            </button>
            <button
                className={linkClass("/search")}
                onClick={() => navigate("/search")}
            >
                Search
            </button>
            <button
                className={linkClass("/requests")}
                onClick={() => navigate("/requests")}
            >
                My requests
            </button>
            {user?.role === "ADMIN" && (
                <button
                    className={linkClass("/admin")}
                    onClick={() => navigate("/admin")}
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
                >
                    Listen ↗
                </a>
            )}
            <button className={styles.link} onClick={logout}>
                Log out
            </button>
        </nav>
    );
}
