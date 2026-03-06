import { Router } from "express";
import { StorageController } from "../controllers/storage.controller";
import { upload } from "../middleware/upload.middleware";

export function createStorageRouter(storageController: StorageController): Router {
    const router = Router();

    router.post("/upload", upload.single("file"), storageController.uploadFile);
    router.get("/presigned-url", storageController.getPresignedUrl);
    router.get("/signed-url", storageController.getSignedUrl);
    router.delete("/file", storageController.deleteFile);

    return router;
}