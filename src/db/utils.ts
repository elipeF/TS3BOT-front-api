import mongoose from 'mongoose';
export async function dbConnect(): Promise<void> {
    const database = mongoose.connection;
    database.once('open', async () => {
        console.log('[db]: Connected to database');
    });
    database.on('error', () => {
        console.log('[db]: Error connecting to database');
        process.exit(1);
    });
    if (process.env.MONGO_URL) {
        await mongoose.connect(process.env.MONGO_URL, {
            useNewUrlParser: true,
            useFindAndModify: true,
            useUnifiedTopology: true,
            useCreateIndex: true,
        });
    } else {
        console.log('Please provide MONGO_URL as ENV');
        process.exit();
    }
}
export const dbDisconnect = (): Promise<void> => {
    return mongoose.disconnect();
};
