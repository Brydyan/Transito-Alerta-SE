"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseStorageClient = void 0;
const common_1 = require("@nestjs/common");
const supabase_js_1 = require("@supabase/supabase-js");
const SIGNED_URL_EXPIRES_IN_SECONDS = 3600;
let SupabaseStorageClient = class SupabaseStorageClient {
    constructor(conf) {
        if (!conf.supabaseUrl) {
            throw new Error('STORAGE_SUPABASE_URL is required when STORAGE_PROVIDER=supabase');
        }
        if (!conf.supabaseServiceKey) {
            throw new Error('STORAGE_SUPABASE_SERVICE_KEY is required when STORAGE_PROVIDER=supabase');
        }
        this.client = (0, supabase_js_1.createClient)(conf.supabaseUrl, conf.supabaseServiceKey);
        this.bucket = conf.supabaseBucket;
    }
    async upload(key, buffer, mimetype) {
        const { error } = await this.client.storage.from(this.bucket).upload(key, buffer, {
            contentType: mimetype,
            upsert: false,
        });
        if (error) {
            throw new Error(`Supabase Storage upload failed for "${key}": ${error.message}`);
        }
        return { key, url: await this.getSignedUrl(key) };
    }
    async getSignedUrl(key) {
        const { data, error } = await this.client.storage
            .from(this.bucket)
            .createSignedUrl(key, SIGNED_URL_EXPIRES_IN_SECONDS);
        if (error || !data) {
            throw new Error(`Supabase Storage signed URL failed for "${key}": ${error?.message ?? 'no data'}`);
        }
        return data.signedUrl;
    }
    async delete(key) {
        const { error } = await this.client.storage.from(this.bucket).remove([key]);
        if (error) {
            throw new Error(`Supabase Storage delete failed for "${key}": ${error.message}`);
        }
    }
};
exports.SupabaseStorageClient = SupabaseStorageClient;
exports.SupabaseStorageClient = SupabaseStorageClient = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Object])
], SupabaseStorageClient);
//# sourceMappingURL=supabase-storage.client.js.map