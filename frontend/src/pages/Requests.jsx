import { useState, useEffect } from "react";
import { api } from "../api.js";
import Nav from "../components/Nav.jsx";
import styles from "./Requests.module.css";

const STATUS_LABEL = {
    PENDING: "Pending approval",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    SEARCHING: "Searching...",
    DOWNLOADING: "Downloading...",
    COMPLETE: "Complete",
    FAILED: "Failed",
};

export default function Requests() {
    const [requests, setRequests] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/requests")
            .then(setRequests)
            .catch(() => setError("Failed to load requests"));
    }, []);

    return (
        <>
            <Nav />
            <div className="wrap">
                <h2 className={styles.heading}>My Requests</h2>
                {error && <p className={styles.error}>{error}</p>}
                {requests.length === 0 && (
                    <p className={styles.empty}>No requests yet.</p>
                )}
                <ul className={styles.list}>
                    {requests.map((r) => (
                        <li key={r.id} className={styles.item}>
                            <span>
                                <strong>{r.title}</strong> — {r.artist}
                            </span>
                            <span className={styles.status}>
                                {STATUS_LABEL[r.status] || r.status}
                            </span>
                            {r.status === "REJECTED" && r.rejectedReason && (
                                <span className={styles.rejectedReason}>
                                    {r.rejectedReason}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </>
    );
}
