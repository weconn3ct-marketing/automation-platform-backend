import { Router } from 'express';
import {
    listPosts,
    getPost,
    createPost,
    updatePost,
    deletePost,
    publishPost,
} from '../controllers/posts.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// All post routes require authentication
router.use(authenticate);

router.get('/', listPosts);
router.post('/', createPost);
router.get('/:id', getPost);
router.put('/:id', updatePost);
router.delete('/:id', deletePost);
router.post('/:id/publish', publishPost);

export default router;
