import React from 'react';

/**
 * @typedef {Object} PageProps
 * @property {number} index
 * @property {boolean} flipped
 * @property {number} zIndex
 * @property {React.ReactNode} frontContent
 * @property {React.ReactNode} backContent
 */

/**
 * Single physical sheet (front + back). The parent controls whether
 * this sheet is already turned by toggling the `flipped` class.
 * @param {PageProps} props
 */
export function Page({ index, flipped, zIndex, frontContent, backContent }) {
    return (
        <article className={`book-sheet ${flipped ? 'flipped' : ''}`} style={{ zIndex }} aria-label={`Sheet ${index + 1}`}>
            {/* Front side of the sheet */}
            <div className="book-face book-face-front">{frontContent}</div>

            {/* Back side of the same sheet */}
            <div className="book-face book-face-back">{backContent}</div>
        </article>
    );
}
