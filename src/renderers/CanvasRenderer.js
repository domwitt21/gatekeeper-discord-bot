/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Canvas Renderer
 *
 * Generic graphics engine used throughout the application.
 *
 * This class intentionally knows nothing about CAPTCHAs.
 * It only exposes drawing primitives and utility methods.
 *
 * Future Uses
 * ------------------------------------------------------------
 * • CAPTCHA rendering
 * • Welcome cards
 * • Statistics cards
 * • Leaderboards
 * • Profile cards
 * • Dynamic banners
 * ============================================================
 */

const {
    createCanvas,
    loadImage,
    registerFont
} = require("canvas");

const crypto = require("crypto");

class CanvasRenderer {

    /**
     * ========================================================
     * Constructor
     * ========================================================
     */

    constructor(width = 320, height = 120) {

        this.width = width;
        this.height = height;

        this.canvas = createCanvas(
            width,
            height
        );

        this.context =
            this.canvas.getContext("2d");

        /**
         * Enable high-quality rendering.
         */

        this.context.imageSmoothingEnabled = true;
        this.context.textBaseline = "middle";
        this.context.textAlign = "center";

    }

    /**
     * ========================================================
     * Canvas Access
     * ========================================================
     */

    getCanvas() {

        return this.canvas;

    }

    getContext() {

        return this.context;

    }

    /**
     * ========================================================
     * Clear Canvas
     * ========================================================
     */

    clear() {

        this.context.clearRect(
            0,
            0,
            this.width,
            this.height
        );

        return this;

    }

    /**
     * ========================================================
     * Fill Background
     * ========================================================
     */

    fill(color = "#FFFFFF") {

        this.context.fillStyle = color;

        this.context.fillRect(
            0,
            0,
            this.width,
            this.height
        );

        return this;

    }

    /**
     * ========================================================
     * Secure Random Integer
     * ========================================================
     */

    random(min, max) {

        return crypto.randomInt(
            min,
            max + 1
        );

    }

    /**
     * ========================================================
     * Random Float
     * ========================================================
     */

    randomFloat(min, max) {

        return (
            Math.random() *
            (max - min)
        ) + min;

    }

    /**
     * ========================================================
     * Random Boolean
     * ========================================================
     */

    randomBool() {

        return this.random(0, 1) === 1;

    }

    /**
     * ========================================================
     * Random Choice
     * ========================================================
     */

    randomChoice(array = []) {

        if (!Array.isArray(array) || array.length === 0) {

            return null;

        }

        return array[
            this.random(
                0,
                array.length - 1
            )
        ];

    }

    /**
     * ========================================================
     * Random Hex Color
     * ========================================================
     */

    randomColor() {

        const value =
            crypto.randomBytes(3).toString("hex");

        return `#${value}`;

    }

    /**
     * ========================================================
     * RGB Color Helper
     * ========================================================
     */

    rgb(r, g, b) {

        return `rgb(${r}, ${g}, ${b})`;

    }

    /**
     * ========================================================
     * RGBA Color Helper
     * ========================================================
     */

    rgba(r, g, b, a = 1) {

        return `rgba(${r}, ${g}, ${b}, ${a})`;

    }

    /**
     * ========================================================
     * Clamp
     * ========================================================
     */

    clamp(value, min, max) {

        return Math.max(
            min,
            Math.min(max, value)
        );

    }

    /**
     * ========================================================
     * Register Custom Font
     * ========================================================
     */

    static register(path, family) {

        registerFont(path, {

            family

        });

    }

    /**
     * ========================================================
     * Load Image
     * ========================================================
     */

    static async image(path) {

        return loadImage(path);

    }
    
        /**
     * ========================================================
     * Linear Gradient Background
     * ========================================================
     */

    fillLinearGradient(startColor, endColor) {

        const gradient =
            this.context.createLinearGradient(

                0,
                0,

                this.width,
                this.height

            );

        gradient.addColorStop(0, startColor);
        gradient.addColorStop(1, endColor);

        this.context.fillStyle = gradient;

        this.context.fillRect(

            0,
            0,

            this.width,
            this.height

        );

        return this;

    }

    /**
     * ========================================================
     * Radial Gradient Background
     * ========================================================
     */

    fillRadialGradient(innerColor, outerColor) {

        const gradient =
            this.context.createRadialGradient(

                this.width / 2,
                this.height / 2,
                10,

                this.width / 2,
                this.height / 2,
                this.width

            );

        gradient.addColorStop(0, innerColor);
        gradient.addColorStop(1, outerColor);

        this.context.fillStyle = gradient;

        this.context.fillRect(

            0,
            0,

            this.width,
            this.height

        );

        return this;

    }

    /**
     * ========================================================
     * Dot Noise
     * ========================================================
     */

    drawNoise(count = 250) {

        for (let i = 0; i < count; i++) {

            this.context.fillStyle =
                this.randomColor();

            this.context.beginPath();

            this.context.arc(

                this.random(0, this.width),

                this.random(0, this.height),

                this.randomFloat(0.4, 1.5),

                0,

                Math.PI * 2

            );

            this.context.fill();

        }

        return this;

    }

    /**
     * ========================================================
     * Random Circles
     * ========================================================
     */

    drawCircles(count = 20) {

        for (let i = 0; i < count; i++) {

            this.context.beginPath();

            this.context.strokeStyle =
                this.rgba(

                    this.random(50, 255),

                    this.random(50, 255),

                    this.random(50, 255),

                    0.25

                );

            this.context.lineWidth =
                this.randomFloat(0.5, 2);

            this.context.arc(

                this.random(0, this.width),

                this.random(0, this.height),

                this.random(6, 30),

                0,

                Math.PI * 2

            );

            this.context.stroke();

        }

        return this;

    }

    /**
     * ========================================================
     * Grid Overlay
     * ========================================================
     */

    drawGrid(spacing = 20) {

        this.context.strokeStyle =
            this.rgba(0, 0, 0, 0.08);

        this.context.lineWidth = 1;

        for (

            let x = 0;

            x <= this.width;

            x += spacing

        ) {

            this.context.beginPath();

            this.context.moveTo(x, 0);

            this.context.lineTo(

                x,

                this.height

            );

            this.context.stroke();

        }

        for (

            let y = 0;

            y <= this.height;

            y += spacing

        ) {

            this.context.beginPath();

            this.context.moveTo(0, y);

            this.context.lineTo(

                this.width,

                y

            );

            this.context.stroke();

        }

        return this;

    }

    /**
     * ========================================================
     * Random Lines
     * ========================================================
     */

    drawRandomLines(count = 8) {

        for (let i = 0; i < count; i++) {

            this.context.beginPath();

            this.context.strokeStyle =
                this.randomColor();

            this.context.lineWidth =
                this.randomFloat(1, 3);

            this.context.moveTo(

                this.random(0, this.width),

                this.random(0, this.height)

            );

            this.context.lineTo(

                this.random(0, this.width),

                this.random(0, this.height)

            );

            this.context.stroke();

        }

        return this;

    }

    /**
     * ========================================================
     * Border
     * ========================================================
     */

    drawBorder(
        color = "#000000",
        width = 2
    ) {

        this.context.strokeStyle = color;

        this.context.lineWidth = width;

        this.context.strokeRect(

            0,

            0,

            this.width,

            this.height

        );

        return this;

    }
    
        /**
     * ========================================================
     * Set Font
     * ========================================================
     */

    setFont(size = 42, family = "sans-serif", weight = "bold") {

        this.context.font =
            `${weight} ${size}px "${family}"`;

        return this;

    }

    /**
     * ========================================================
     * Set Fill Color
     * ========================================================
     */

    setFillColor(color) {

        this.context.fillStyle = color;

        return this;

    }

    /**
     * ========================================================
     * Set Stroke Color
     * ========================================================
     */

    setStrokeColor(color) {

        this.context.strokeStyle = color;

        return this;

    }

    /**
     * ========================================================
     * Text Shadow
     * ========================================================
     */

    setShadow(color, blur = 4, x = 2, y = 2) {

        this.context.shadowColor = color;
        this.context.shadowBlur = blur;
        this.context.shadowOffsetX = x;
        this.context.shadowOffsetY = y;

        return this;

    }

    /**
     * ========================================================
     * Clear Shadow
     * ========================================================
     */

    clearShadow() {

        this.context.shadowColor = "transparent";
        this.context.shadowBlur = 0;
        this.context.shadowOffsetX = 0;
        this.context.shadowOffsetY = 0;

        return this;

    }

    /**
     * ========================================================
     * Rotate Around Point
     * ========================================================
     */

    rotate(angle, x, y) {

        this.context.translate(x, y);

        this.context.rotate(angle);

        this.context.translate(-x, -y);

        return this;

    }

    /**
     * ========================================================
     * Save Context
     * ========================================================
     */

    save() {

        this.context.save();

        return this;

    }

    /**
     * ========================================================
     * Restore Context
     * ========================================================
     */

    restore() {

        this.context.restore();

        return this;

    }

    /**
     * ========================================================
     * Draw Character
     * ========================================================
     *
     * Draws a single glyph.
     */

    drawCharacter(character, options = {}) {

        const {

            x,
            y,

            size = 42,

            family = "sans-serif",

            weight = "bold",

            rotation = 0,

            color = "#222222",

            stroke = false,

            strokeColor = "#000000",

            shadow = false

        } = options;

        this.save();

        this.setFont(
            size,
            family,
            weight
        );

        this.setFillColor(color);

        if (shadow) {

            this.setShadow(

                this.rgba(
                    0,
                    0,
                    0,
                    0.35
                ),

                5,

                2,

                2

            );

        }

        this.rotate(
            rotation,
            x,
            y
        );

        this.context.fillText(

            character,

            x,

            y

        );

        if (stroke) {

            this.setStrokeColor(
                strokeColor
            );

            this.context.lineWidth = 1.25;

            this.context.strokeText(

                character,

                x,

                y

            );

        }

        this.restore();

        return this;

    }

    /**
     * ========================================================
     * Draw String
     * ========================================================
     */

    drawString(text, options = {}) {

        const {

            startX = 40,

            y = this.height / 2,

            spacing = 38,

            size = 42,

            family = "sans-serif",

            weight = "bold",

            color = "#222222"

        } = options;

        [...text].forEach((character, index) => {

            const x =
                startX + (spacing * index);

            this.drawCharacter(

                character,

                {

                    x,

                    y,

                    size,

                    family,

                    weight,

                    color

                }

            );

        });

        return this;

    }

    /**
     * ========================================================
     * Measure Text
     * ========================================================
     */

    measure(text) {

        return this.context.measureText(
            text
        );

    }

    /**
     * ========================================================
     * Center X Position
     * ========================================================
     */

    centerText(text) {

        const width =
            this.measure(text).width;

        return (

            this.width - width

        ) / 2;

    }

        /**
     * ========================================================
     * Draw Random Bezier Curves
     * ========================================================
     */

    drawCurves(count = 4) {

        for (let i = 0; i < count; i++) {

            this.context.beginPath();

            this.context.strokeStyle = this.rgba(

                this.random(50, 200),
                this.random(50, 200),
                this.random(50, 200),
                0.45

            );

            this.context.lineWidth =
                this.randomFloat(1.5, 3);

            this.context.moveTo(

                this.random(0, this.width),

                this.random(0, this.height)

            );

            this.context.bezierCurveTo(

                this.random(0, this.width),
                this.random(0, this.height),

                this.random(0, this.width),
                this.random(0, this.height),

                this.random(0, this.width),
                this.random(0, this.height)

            );

            this.context.stroke();

        }

        return this;

    }

    /**
     * ========================================================
     * Draw Wave Lines
     * ========================================================
     */

    drawWaveLines(
        count = 2,
        amplitude = 12,
        wavelength = 24
    ) {

        for (let n = 0; n < count; n++) {

            const startY =
                this.random(
                    20,
                    this.height - 20
                );

            this.context.beginPath();

            this.context.strokeStyle =
                this.rgba(

                    this.random(50, 150),

                    this.random(50, 150),

                    this.random(50, 150),

                    0.40

                );

            this.context.lineWidth =
                this.randomFloat(1, 2.5);

            for (

                let x = 0;

                x <= this.width;

                x++

            ) {

                const y =

                    startY +

                    Math.sin(
                        x / wavelength
                    ) *

                    amplitude;

                if (x === 0) {

                    this.context.moveTo(
                        x,
                        y
                    );

                }

                else {

                    this.context.lineTo(
                        x,
                        y
                    );

                }

            }

            this.context.stroke();

        }

        return this;

    }

    /**
     * ========================================================
     * Random Character Rotation
     * ========================================================
     */

    randomRotation(maxDegrees = 25) {

        const angle =
            this.randomFloat(

                -maxDegrees,

                maxDegrees

            );

        return angle * Math.PI / 180;

    }

    /**
     * ========================================================
     * Random Character Offset
     * ========================================================
     */

    randomOffset(maxX = 6, maxY = 8) {

        return {

            x: this.randomFloat(
                -maxX,
                maxX
            ),

            y: this.randomFloat(
                -maxY,
                maxY
            )

        };

    }

    /**
     * ========================================================
     * Draw Distorted String
     * ========================================================
     */

    drawDistortedString(text, options = {}) {

        const {

            startX = 35,

            y = this.height / 2,

            spacing = 42,

            size = 44,

            family = "sans-serif",

            weight = "bold",

            color = "#1F2937",

            stroke = true,

            shadow = true,

            maxRotation = 25

        } = options;

        [...text].forEach((character, index) => {

            const offset =
                this.randomOffset();

            this.drawCharacter(

                character,

                {

                    x:
                        startX +

                        (spacing * index) +

                        offset.x,

                    y:
                        y +

                        offset.y,

                    size,

                    family,

                    weight,

                    color,

                    stroke,

                    shadow,

                    rotation:
                        this.randomRotation(
                            maxRotation
                        )

                }

            );

        });

        return this;

    }

    /**
     * ========================================================
     * Sprinkle Rectangles
     * ========================================================
     */

    drawRectangles(count = 25) {

        for (let i = 0; i < count; i++) {

            this.context.fillStyle = this.rgba(

                this.random(0, 255),

                this.random(0, 255),

                this.random(0, 255),

                0.08

            );

            this.context.fillRect(

                this.random(
                    0,
                    this.width
                ),

                this.random(
                    0,
                    this.height
                ),

                this.random(
                    2,
                    8
                ),

                this.random(
                    2,
                    8
                )

            );

        }

        return this;

    }

    /**
     * ========================================================
     * Sprinkle Triangles
     * ========================================================
     */

    drawTriangles(count = 20) {

        for (let i = 0; i < count; i++) {

            const x =
                this.random(0, this.width);

            const y =
                this.random(0, this.height);

            const size =
                this.random(4, 12);

            this.context.beginPath();

            this.context.fillStyle = this.rgba(

                this.random(100, 255),

                this.random(100, 255),

                this.random(100, 255),

                0.10

            );

            this.context.moveTo(x, y);

            this.context.lineTo(
                x + size,
                y
            );

            this.context.lineTo(
                x + (size / 2),
                y + size
            );

            this.context.closePath();

            this.context.fill();

        }

        return this;

    }

        /**
     * ========================================================
     * Canvas Dimensions
     * ========================================================
     */

    dimensions() {

        return {

            width: this.width,

            height: this.height

        };

    }

    /**
     * ========================================================
     * Export PNG Buffer
     * ========================================================
     */

    toBuffer() {

        return this.canvas.toBuffer("image/png");

    }

    /**
     * ========================================================
     * Alias
     * ========================================================
     */

    toPNG() {

        return this.toBuffer();

    }

    /**
     * ========================================================
     * Export JPEG Buffer
     * ========================================================
     */

    toJPEG(quality = 0.95) {

        return this.canvas.toBuffer(

            "image/jpeg",

            {

                quality

            }

        );

    }

    /**
     * ========================================================
     * Export Data URL
     * ========================================================
     */

    toDataURL() {

        return this.canvas.toDataURL();

    }

    /**
     * ========================================================
     * Save Image
     * ========================================================
     */

    async saveToFile(filePath) {

        const fs = require("fs/promises");

        await fs.writeFile(

            filePath,

            this.toBuffer()

        );

        return filePath;

    }

    /**
     * ========================================================
     * Render Metadata
     * ========================================================
     */

    metadata() {

        return {

            width: this.width,

            height: this.height,

            renderer: "CanvasRenderer",

            version: "1.0.0",

            generatedAt: new Date().toISOString()

        };

    }

    /**
     * ========================================================
     * Clone Renderer
     * ========================================================
     *
     * Creates a new blank renderer with the
     * same dimensions.
     */

    clone() {

        return new CanvasRenderer(

            this.width,

            this.height

        );

    }

    /**
     * ========================================================
     * Reset Canvas
     * ========================================================
     */

    reset(background = "#FFFFFF") {

        return this

            .clear()

            .fill(background);

    }

    /**
     * ========================================================
     * Execute Drawing Callback
     * ========================================================
     *
     * Automatically saves and restores the
     * canvas state around a drawing operation.
     */

    withState(callback) {

        // this.save();

        try {

            callback(this);

        }

        finally {

            this.restore();

        }

        return this;

    }

    /**
     * ========================================================
     * Render Summary
     * ========================================================
     */

    summary() {

        return {

            ...this.metadata(),

            bufferSize:

                this.toBuffer().length

        };

    }

}

module.exports = CanvasRenderer;