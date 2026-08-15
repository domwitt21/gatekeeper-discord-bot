/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Captcha Service
 *
 * Generates secure CAPTCHA challenges and coordinates:
 *
 * • Random text generation
 * • Secure hashing
 * • Rendering
 * • Expiration
 * • Verification metadata
 * ============================================================
 */

const crypto = require("crypto");

const CaptchaRenderer = require("../renderers/CaptchaRenderer");

class CaptchaService {

    /**
     * ========================================================
     * Character Pools
     * ========================================================
     *
     * Ambiguous characters are intentionally removed.
     */

    static LETTERS =

        "ABCDEFGHJKLMNPQRSTUVWXYZ";

    static NUMBERS =

        "23456789";

    static DEFAULT_LENGTH = 6;

    static DEFAULT_EXPIRATION =

        5 * 60 * 1000;

    /**
     * ========================================================
     * Default Configuration
     * ========================================================
     */

    static CONFIG = {

        length:

            CaptchaService.DEFAULT_LENGTH,

        expiration:

            CaptchaService.DEFAULT_EXPIRATION,

        difficulty:

            "MEDIUM",

        typography:

            "DEFAULT",

        theme: {}

    };

        /**
     * ========================================================
     * Verification Results
     * ========================================================
     */

    static RESULT = {

        SUCCESS: "SUCCESS",

        INVALID: "INVALID",

        EXPIRED: "EXPIRED",

        NOT_FOUND: "NOT_FOUND"

    };

    /**
     * ========================================================
     * Constructor
     * ========================================================
     */

    constructor(config = {}) {

        this.config = {

            ...CaptchaService.CONFIG,

            ...config

        };

        this.renderer =

            new CaptchaRenderer(

                this.config.theme,

                this.config.difficulty,

                this.config.typography

            );

            this.cache = new Map();

                this.cleanupTimer = setInterval(

            () => {

                this.cleanup();

            },

            60 * 1000

        );

    }

    /**
     * ========================================================
     * Character Set
     * ========================================================
     */

    getCharacterPool() {

        return (

            CaptchaService.LETTERS +

            CaptchaService.NUMBERS

        );

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
     * Random Character
     * ========================================================
     */

    randomCharacter() {

        const pool =

            this.getCharacterPool();

        return pool[

            this.random(

                0,

                pool.length - 1

            )

        ];

    }

    /**
     * ========================================================
     * Configuration
     * ========================================================
     */

    getConfig() {

        return this.config;

    }

    updateConfig(config = {}) {

        this.config = {

            ...this.config,

            ...config

        };

        this.renderer =

            new CaptchaRenderer(

                this.config.theme,

                this.config.difficulty,

                this.config.typography

            );

        return this;

    }

        /**
     * ========================================================
     * Generate CAPTCHA Text
     * ========================================================
     */

    generateText(length = this.config.length) {

        let text = "";

        for (let i = 0; i < length; i++) {

            text += this.randomCharacter();

        }

        return text;

    }

    /**
     * ========================================================
     * Generate Secure Salt
     * ========================================================
     */

    generateSalt(size = 16) {

        return crypto
            .randomBytes(size)
            .toString("hex");

    }

    /**
     * ========================================================
     * Generate Challenge ID
     * ========================================================
     */

    generateId() {

        return crypto.randomUUID();

    }

    /**
     * ========================================================
     * Create Hash
     * ========================================================
     */

    createHash(text, salt) {

        return crypto

            .createHash("sha256")

            .update(text + salt)

            .digest("hex");

    }

    /**
     * ========================================================
     * Expiration Timestamp
     * ========================================================
     */

    expirationDate() {

        return new Date(

            Date.now() +

            this.config.expiration

        );

    }

    /**
     * ========================================================
     * Generate Challenge
     * ========================================================
     *
     * Creates the security information only.
     * Rendering happens in Part 3.
     */

    generateChallenge() {

        const text =

            this.generateText();

        const salt =

            this.generateSalt();

        const hash =

            this.createHash(

                text,

                salt

            );

        return {

            id: this.generateId(),

            text,

            salt,

            hash,

            createdAt:

                new Date(),

            expiresAt:

                this.expirationDate()

        };

    }

    /**
     * ========================================================
     * Verify Hash
     * ========================================================
     */

    verifyHash(

        text,

        salt,

        hash

    ) {

        return (

            this.createHash(

                text,

                salt

            ) === hash

        );

    }

    /**
     * ========================================================
     * Is Expired
     * ========================================================
     */

    isExpired(expiresAt) {

        return (

            Date.now() >

            new Date(

                expiresAt

            ).getTime()

        );

    }

        /**
     * ========================================================
     * Render CAPTCHA Image
     * ========================================================
     */

    renderChallenge(text) {

        const result =

            this.renderer.render(text);

        return result;

    }

    /**
     * ========================================================
     * Create Discord Attachment
     * ========================================================
     */

    createAttachment(
        text,
        filename = "captcha.png"
    ) {

        return this.renderer.createAttachment(
            text,
            filename
        );

    }

    /**
     * ========================================================
     * Generate Complete CAPTCHA
     * ========================================================
     *
     * This is the primary method used by the
     * verification system.
     */

    async generate(options = {}) {

        const settings = {
            ...this.config,
            ...options
        };

        const text = this.generateText(settings.length);
        const salt = this.generateSalt();
        const challenge = {
            id: this.generateId(),
            text,
            salt,
            hash: this.createHash(text, salt),
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + settings.expiration)
        };

        const renderer = new CaptchaRenderer(
            settings.theme,
            settings.difficulty,
            settings.typography
        );

        const render = renderer.render(challenge.text);
        const attachment = renderer.createAttachment(challenge.text);
        
        this.cacheChallenge({

            id: challenge.id,

            text: challenge.text,

            salt: challenge.salt,

            hash: challenge.hash,

            createdAt: challenge.createdAt,

            expiresAt: challenge.expiresAt

        });

        return {

            /**
             * Security
             */

            id: challenge.id,

            text: challenge.text,

            captchaText: challenge.text,

            salt: challenge.salt,

            hash: challenge.hash,

            /**
             * Verification
             */

            maxAttempts: settings.maxAttempts ?? 5,

            /**
             * Lifetime
             */

            createdAt: challenge.createdAt,

            expiresAt: challenge.expiresAt,

            /**
             * Discord
             */

            attachment,

            /**
             * Image
             */

            image: render.buffer,

            metadata: render.metadata

        };

    }

    /**
     * ========================================================
     * Generate Multiple Challenges
     * ========================================================
     */

    async generateBatch(
        amount = 1
    ) {

        const batch = [];

        for (

            let i = 0;

            i < amount;

            i++

        ) {

            batch.push(

                await this.generate()

            );

        }

        return batch;

    }

    /**
     * ========================================================
     * Preview CAPTCHA
     * ========================================================
     *
     * Used for testing.
     */

    async preview() {

        return this.generate();

    }

        /**
     * ========================================================
     * Cache Challenge
     * ========================================================
     */

    cacheChallenge(challenge) {

        this.cache.set(
            challenge.id,
            challenge
        );

        return challenge;
    }

    /**
     * ========================================================
     * Retrieve Challenge
     * ========================================================
     */

    getChallenge(id) {

        return this.cache.get(id) ?? null;

    }

    /**
     * ========================================================
     * Remove Challenge
     * ========================================================
     */

    removeChallenge(id) {

        return this.cache.delete(id);

    }

    /**
     * ========================================================
     * Verify Challenge
     * ========================================================
     */

    verify(id, userInput) {

        const challenge =
            this.getChallenge(id);

        if (!challenge) {

            return {

                success: false,

                reason: CaptchaService.RESULT.NOT_FOUND

            };

        }

        if (

            this.isExpired(

                challenge.expiresAt

            )

        ) {

            this.removeChallenge(id);

            return {

                success: false,

                reason: CaptchaService.RESULT.EXPIRED

            };

        }

        const valid =

            this.verifyHash(

                userInput.trim().toUpperCase(),

                challenge.salt,

                challenge.hash

            );

        if (!valid) {

            return {

                success: false,

                reason: CaptchaService.RESULT.INVALID

            };

        }

        this.removeChallenge(id);

        return {

            success: true,

            reason: CaptchaService.RESULT.SUCCESS,

            challenge

        };

    }

    /**
     * ========================================================
     * Cleanup Expired Challenges
     * ========================================================
     */

    cleanup() {

        let removed = 0;

        for (

            const [

                id,

                challenge

            ] of this.cache

        ) {

            if (

                this.isExpired(

                    challenge.expiresAt

                )

            ) {

                this.cache.delete(id);

                removed++;

            }

        }

        return removed;

    }

    /**
     * ========================================================
     * Cache Size
     * ========================================================
     */

    size() {

        return this.cache.size;

    }

    /**
     * ========================================================
     * Clear Cache
     * ========================================================
     */

    clear() {

        this.cache.clear();

        return this;

    }

    /**
     * ========================================================
     * Challenge Statistics
     * ========================================================
     */

    stats() {

        return {

            active:

                this.cache.size,

            difficulty:

                this.config.difficulty,

            expiration:

                this.config.expiration,

            length:

                this.config.length

        };

    }

        /**
     * ========================================================
     * Public Challenge View
     * ========================================================
     *
     * Removes sensitive verification data.
     */

    publicView(challenge) {

        return {

            id:

                challenge.id,

            createdAt:

                challenge.createdAt,

            expiresAt:

                challenge.expiresAt

        };

    }

        /**
     * ========================================================
     * Create Service Instance
     * ========================================================
     */

    static create(config = {}) {

        return new CaptchaService(

            config

        );

    }

        /**
     * ========================================================
     * Shutdown Service
     * ========================================================
     */

    shutdown() {

        if (this.cleanupTimer) {

            clearInterval(

                this.cleanupTimer

            );

        }

        this.clear();

    }

        /**
     * ========================================================
     * Service Health
     * ========================================================
     */

    health() {

        return {

            status: "ONLINE",

            activeChallenges:

                this.cache.size,

            timestamp:

                new Date()

        };

    }

}

module.exports = CaptchaService;
