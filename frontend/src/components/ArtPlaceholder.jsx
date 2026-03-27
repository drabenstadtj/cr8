import styles from './ArtPlaceholder.module.css'

export default function ArtPlaceholder({ className }) {
    return (
        <div className={`${styles.placeholder} ${className ?? ''}`}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.icon}>
                <path d="M9 18V6l12-2v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
                <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
        </div>
    )
}
