import React, { useEffect, useState } from 'react';

const ConfettiPiece: React.FC<{ style: React.CSSProperties }> = ({ style }) => {
    return <div className="confetti" style={style}></div>;
};

const Confetti: React.FC = () => {
    const [pieces, setPieces] = useState<React.CSSProperties[]>([]);

    useEffect(() => {
        const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];
        
        const generatePieces = () => {
            const newPieces: React.CSSProperties[] = [];
            for (let i = 0; i < 100; i++) {
                newPieces.push({
                    left: `${Math.random() * 100}vw`,
                    animationDelay: `${Math.random() * 3}s`,
                    backgroundColor: colors[Math.floor(Math.random() * colors.length)],
                    transform: `rotate(${Math.random() * 360}deg)`,
                });
            }
            setPieces(newPieces);
        };
        generatePieces();
    }, []);

    return (
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-50 overflow-hidden">
            {pieces.map((style, index) => (
                <ConfettiPiece key={index} style={style} />
            ))}
        </div>
    );
};

export default Confetti;