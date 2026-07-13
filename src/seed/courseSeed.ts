import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { CourseModel } from '../models/course.model.js';
import { courseSeedData } from '../data/courseSeedData.js'; // Ensure path matches your merged array file

// Setup environment variable reading
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const seedDatabase = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error("MONGODB_URI is missing from your .env file!");
        }

        console.log("Connecting to MongoDB Atlas...");
        await mongoose.connect(mongoUri);
        console.log("Connected successfully.");

        // 1. Clear out any remnant or half-formed structural documents
        console.log("Clearing existing courses collection...");
        await CourseModel.deleteMany({});

        // 2. Insert the brand-new, beautifully stylized dataset
        console.log(`Seeding ${courseSeedData.length} courses with full assets...`);
        await CourseModel.insertMany(courseSeedData);

        console.log("🎉 Database seeded perfectly!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Seeding failed error:", error);
        process.exit(1);
    }
};

seedDatabase();