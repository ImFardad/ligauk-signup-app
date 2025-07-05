// Basic strategy: generate random hex colors and check for very close similarity (naive)
// For a production system, a more sophisticated algorithm or a predefined list of visually distinct colors is better.
function getRandomHexColor() {
    return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
}

// This is a very basic check. Real perceptual distance is complex.
function areColorsTooSimilar(color1, color2, threshold = 50) {
    if (!color1 || !color2) return false;
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const distance = Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
    return distance < threshold;
}

exports.generateDistinctColors = (count, existingColors = []) => {
    const newColors = [];
    let attempts = 0;
    const maxAttempts = count * 20; // Avoid infinite loops

    while (newColors.length < count && attempts < maxAttempts) {
        const candidateColor = getRandomHexColor();
        let isDistinct = true;
        for (const existing of existingColors.concat(newColors)) {
            if (areColorsTooSimilar(candidateColor, existing)) {
                isDistinct = false;
                break;
            }
        }
        if (isDistinct) {
            newColors.push(candidateColor);
        }
        attempts++;
    }
    // If failed to generate enough distinct colors, fill with random (less ideal)
    while (newColors.length < count) {
        newColors.push(getRandomHexColor());
    }
    return newColors;
};
