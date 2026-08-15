/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * CAPTCHA Renderer
 *
 * Creates CAPTCHA images using CanvasRenderer.
 *
 * Responsibilities
 * ------------------------------------------------------------
 * • Select rendering theme
 * • Draw backgrounds
 * • Draw visual noise
 * • Render distorted text
 * • Export PNG image
 * ============================================================
 */

const CanvasRenderer = require("./CanvasRenderer");

class CaptchaRenderer {

    /**
     * ========================================================
     * Default Theme
     * ========================================================
     */

    static DEFAULT_THEME = {

        width: 320,

        height: 120,

        background: {

            start: "#F8FAFC",

            end: "#E2E8F0"

        },

        text: {

            color: "#1F2937",

            stroke: true,

            shadow: true,

            size: 46,

            family: "sans-serif"

        },

        border: "#CBD5E1"

    };

    /**
     * ========================================================
     * Constructor
     * ========================================================
     */

    constructor(
        theme = {},
        difficulty = "MEDIUM",
        typography = "DEFAULT"
    ) {

        this.theme = {

            ...CaptchaRenderer.DEFAULT_THEME,

            ...theme

        };

        this.difficulty =

            CaptchaRenderer.DIFFICULTY[
                difficulty.toUpperCase()
            ] ||

            CaptchaRenderer.DIFFICULTY.MEDIUM;

        this.typography =

            CaptchaRenderer.TYPOGRAPHY[
                typography.toUpperCase()
            ] ||

            CaptchaRenderer.TYPOGRAPHY.DEFAULT;

        this.renderer = new CanvasRenderer(

            this.theme.width,

            this.theme.height

        );

    }

        /**
     * ========================================================
     * Random Font
     * ========================================================
     */

    randomFont() {

        return this.renderer.randomChoice(

            this.typography.fonts

        );

    }

    /**
     * ========================================================
     * Random Font Size
     * ========================================================
     */

    randomFontSize() {

        return this.renderer.random(

            this.typography.minSize,

            this.typography.maxSize

        );

    }

    /**
     * ========================================================
     * Random Text Color
     * ========================================================
     */

    randomTextColor() {

        return this.renderer.randomChoice(

            this.typography.colors

        );

    }

    /**
     * ========================================================
     * Get Renderer
     * ========================================================
     */

    getRenderer() {

        return this.renderer;

    }

        /**
     * ========================================================
     * Render CAPTCHA
     * ========================================================
     */

    render(text) {

        if (!text || typeof text !== "string") {

            throw new Error(
                "CaptchaRenderer.render() requires a valid text string."
            );

        }

        const started = performance.now();

        this.renderer.reset("#FFFFFF");

        this.drawBackground();

        this.drawNoise();

        this.drawText(text);

        this.drawFrame();

        const finished = performance.now();

        return {

            buffer: this.renderer.toPNG(),

            metadata: {

                textLength: text.length,

                width: this.theme.width,

                height: this.theme.height,

                theme: this.theme,

                difficulty: this.difficulty,

                typography: this.typography,

                renderTime:

                    Number(
                        (finished - started)
                            .toFixed(2)
                    )

            }

        };

    }

        /**
     * ========================================================
     * PNG Buffer
     * ========================================================
     */

    renderBuffer(text) {

        return this.render(text).buffer;

    }

    /**
     * ========================================================
     * Render Metadata
     * ========================================================
     */

    renderMetadata(text) {

        return this.render(text).metadata;

    }

    /**
     * ========================================================
     * Discord Attachment
     * ========================================================
     */

    createAttachment(
        text,
        filename = "captcha.png"
    ) {

        const {

            AttachmentBuilder

        } = require("discord.js");

        return new AttachmentBuilder(

            this.renderBuffer(text),

            {

                name: filename

            }

        );

    }

        /**
     * ========================================================
     * Validate Theme
     * ========================================================
     */

    static validateTheme(theme) {

        return (

            theme &&

            typeof theme.width === "number" &&

            typeof theme.height === "number"

        );

    }

    /**
     * ========================================================
     * Available Difficulties
     * ========================================================
     */

    static difficulties() {

        return Object.keys(

            this.DIFFICULTY

        );

    }

    /**
     * ========================================================
     * Available Typography Profiles
     * ========================================================
     */

    static typographyProfiles() {

        return Object.keys(

            this.TYPOGRAPHY

        );

    }

    /**
     * ========================================================
     * Background
     * ========================================================
     */

    drawBackground() {

        this.renderer

            .fillLinearGradient(

                this.theme.background.start,

                this.theme.background.end

            );

    }

        /**
     * ========================================================
     * Draw Visual Noise
     * ========================================================
     */

    drawNoise() {

        this.renderer

            .drawGrid(

                this.difficulty.gridSpacing

            )

            .drawNoise(

                this.difficulty.dots

            )

            .drawCircles(

                this.difficulty.circles

            )

            .drawCurves(

                this.difficulty.curves

            )

            .drawWaveLines(

                this.difficulty.waves

            )

            .drawRectangles(

                this.difficulty.rectangles

            )

            .drawTriangles(

                this.difficulty.triangles

            );

    }

        /**
     * ========================================================
     * Current Theme
     * ========================================================
     */

    getTheme() {

        return this.theme;

    }

    /**
     * ========================================================
     * Current Difficulty
     * ========================================================
     */

    getDifficulty() {

        return this.difficulty;

    }

        /**
     * ========================================================
     * Typography Profiles
     * ========================================================
     */

    static TYPOGRAPHY = {

        DEFAULT: {

            fonts: [

                "JetBrains Mono",
                "Roboto Mono",
                "Space Mono",
                "IBM Plex Mono",
                "Oxanium",
                "monospace"

            ],

            minSize: 42,

            maxSize: 50,

            maxRotation: 25,

            stroke: true,

            shadow: true,

            colors: [

                "#111827",
                "#1F2937",
                "#374151",
                "#4B5563"

            ]

        }

    };

        /**
     * ========================================================
     * Draw CAPTCHA Text
     * ========================================================
     */

    drawText(text) {

        const spacing =

            (this.theme.width - 70) /

            Math.max(text.length - 1, 1);

        const startX = 35;

        [...text].forEach((character, index) => {

            const offset =
                this.renderer.randomOffset();

            this.renderer.drawCharacter(

                character,

                {

                    x:

                        startX +

                        (spacing * index) +

                        offset.x,

                    y:

                        (this.theme.height / 2) +

                        offset.y,

                    size:

                        this.randomFontSize(),

                    family:

                        this.randomFont(),

                    color:

                        this.randomTextColor(),

                    rotation:

                        this.renderer.randomRotation(

                            this.typography.maxRotation

                        ),

                    stroke:

                        this.typography.stroke,

                    shadow:

                        this.typography.shadow

                }

            );

        });

    }

        /**
     * ========================================================
     * Current Typography
     * ========================================================
     */

    getTypography() {

        return this.typography;

    }

    /**
     * ========================================================
     * Draw Border
     * ========================================================
     */

    drawFrame() {

        this.renderer.drawBorder(

            this.theme.border,

            2

        );

    }

        /**
     * ========================================================
     * Difficulty Profiles
     * ========================================================
     */

    static DIFFICULTY = {

        EASY: {

            gridSpacing: 26,

            dots: 90,

            circles: 10,

            curves: 2,

            waves: 1,

            rectangles: 10,

            triangles: 8

        },

        MEDIUM: {

            gridSpacing: 20,

            dots: 180,

            circles: 18,

            curves: 4,

            waves: 2,

            rectangles: 18,

            triangles: 15

        },

        HARD: {

            gridSpacing: 16,

            dots: 320,

            circles: 28,

            curves: 8,

            waves: 4,

            rectangles: 32,

            triangles: 25

        }

    };

}

module.exports = CaptchaRenderer;