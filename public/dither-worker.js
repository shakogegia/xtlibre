// Floyd-Steinberg Dithering Web Worker

self.onmessage = function(e) {
    const { imageData, width, height, bits, strength, id, xthMode } = e.data;

    const data = new Uint8ClampedArray(imageData);
    const factor = strength / 100;
    const pixelCount = width * height;

    const err7_16 = factor * 7 / 16;
    const err3_16 = factor * 3 / 16;
    const err5_16 = factor * 5 / 16;
    const err1_16 = factor * 1 / 16;

    const gray = new Float32Array(pixelCount);

    for (let i = 0, idx = 0; i < pixelCount; i++, idx += 4) {
        gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }

    const widthM1 = width - 1;
    const heightM1 = height - 1;

    let quantize;
    if (xthMode) {
        quantize = (val) => {
            if (val > 212) return 255;
            else if (val > 127) return 170;
            else if (val > 42) return 85;
            else return 0;
        };
    } else {
        const levels = Math.pow(2, bits);
        const step = 255 / (levels - 1);
        const invStep = 1 / step;
        quantize = (val) => Math.round(val * invStep) * step;
    }

    for (let y = 0; y < height; y++) {
        const rowStart = y * width;
        const nextRowStart = rowStart + width;
        const isNotLastRow = y < heightM1;

        for (let x = 0; x < width; x++) {
            const idx = rowStart + x;
            const oldPixel = gray[idx];
            const newPixel = quantize(oldPixel);

            gray[idx] = newPixel;
            const error = oldPixel - newPixel;

            if (x < widthM1) gray[idx + 1] += error * err7_16;
            if (isNotLastRow) {
                if (x > 0) gray[nextRowStart + x - 1] += error * err3_16;
                gray[nextRowStart + x] += error * err5_16;
                if (x < widthM1) gray[nextRowStart + x + 1] += error * err1_16;
            }
        }
    }

    for (let i = 0, idx = 0; i < pixelCount; i++, idx += 4) {
        const g = gray[i] < 0 ? 0 : (gray[i] > 255 ? 255 : (gray[i] + 0.5) | 0);
        data[idx] = data[idx + 1] = data[idx + 2] = g;
    }

    self.postMessage({ imageData: data.buffer, id }, [data.buffer]);
};
