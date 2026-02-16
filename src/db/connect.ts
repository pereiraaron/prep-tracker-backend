import mongoose from "mongoose";

export const connectToDB = async () => {
  try {
    mongoose.set("toJSON", {
      virtuals: true,
      versionKey: false,
      transform: (_doc: any, ret: any) => {
        delete ret._id;
      },
    });

    const uri = process.env.CONNECTION_STRING as string;
    await mongoose.connect(uri);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};
