import express, { Request, Response } from 'express';
import cors from 'cors';
import { createClient } from 'redis';
import { PythonShell } from 'python-shell';
import path from 'path';

// إعدادات التطبيق
const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// 1. إعداد Redis Client
const redisClient = createClient();

redisClient.on('error', (err: any) => console.log('Redis Client Error', err));

(async () => {
    await redisClient.connect();
    console.log('✅ Connected to Redis');
})();

// 2. دالة تشغيل Python Script
const runPythonNLP = (text: string): Promise<any> => {
    return new Promise((resolve, reject) => {
        const options = {
            mode: 'json' as const,
            pythonOptions: ['-u'], // Unbuffered
            scriptPath: path.join(__dirname, '../'), // الرجوع خطوة للوراء للوصول لملف البايثون
            args: [text]
        };

        PythonShell.run('nlp_engine.py', options).then((results: any) => {
            if (results && results.length > 0) {
                resolve(results[0]);
            } else {
                reject('No results from Python');
            }
        }).catch((err: any) => reject(err));
    });
};

// 3. API Route
app.post('/api/extract', async (req: Request, res: Response): Promise<any> => {
    const { text, docId } = req.body;

    if (!text) {
        return res.status(400).json({ error: "Text is required" });
    }

    // المفتاح للتخزين في Redis
    // نستخدم docId إذا وجد، وإلا نستخدم أول 20 حرف من النص كـ ID مؤقت
    const cacheKey = `metadata:${docId || Buffer.from(text.substring(0, 20)).toString('base64')}`;

    try {
        // أ. فحص الـ Cache أولاً (Redis)
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            console.log('⚡ Serving from Redis Cache');
            return res.json(JSON.parse(cachedData));
        }

        // ب. إذا لم يوجد، نشغل الذكاء الاصطناعي (Python)
        console.log(' Processing with Python...');
        const metadata = await runPythonNLP(text);

        // ج. تخزين النتيجة في Redis (لمدة ساعة - 3600 ثانية)
        await redisClient.set(cacheKey, JSON.stringify(metadata), { EX: 3600 });

        // د. إرسال الرد
        res.json(metadata);

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(` Microservice running on http://localhost:${PORT}`);
});