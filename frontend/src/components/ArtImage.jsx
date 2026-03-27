import { useState } from 'react'
import ArtPlaceholder from './ArtPlaceholder.jsx'

export default function ArtImage({ src, imgClassName, placeholderClassName }) {
    const [failed, setFailed] = useState(false)

    if (failed || !src) {
        return <ArtPlaceholder className={placeholderClassName} />
    }

    return (
        <img
            src={src}
            className={imgClassName}
            onError={() => setFailed(true)}
            alt=""
        />
    )
}
