import { supabase } from '../supabaseClient';
import { Request, Response } from 'express'; 

/**
 * Retrieves all topics from the database.
 * 
 * @route GET /topics
 * @access Public
 * @param req : Request received
 * @param res : Response given 
 * @returns {Array} List of all topic objects 
 */
export async function getAllTopics(req: Request, res: Response) {
    const { data, error } = await supabase
        .from('topics')
        .select('*');
    
        if (error) {
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json(data); 
}

/**
 * Creates a new topic in the repository.
 * New topics are empty by default until questions are linked to them.
 * 
 * @route POST /topics
 * @access Admin only
 * @body {string} name - The unique topic name 
 * @returns {Object} The newly created topic object
 */
export async function createTopic(req: Request, res: Response) {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Topic name is required.'});
    }

    const { data, error } = await supabase
        .schema('question_service')
        .from('topics')
        .insert({ name, is_empty: true })
        .select()
        .single();
    
    if (error) {
        //This error code from postgresql means there is a unique constraint violation
        if (error.code === '23505') {
            return res.status(409).json({ error: `Topic "${name}" already exists.`});
        }
        return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
}

/**
 * Deletes a topic from the repository.
 * Questions that have other topics besides the one being deleted will only have the topic 
 * link removed. Questions that ONLY belong to this topic will be archived since they would 
 * have no topic otherwise. 
 * 
 * @route DELETE/topics/:name
 * @access Admin only
 * @param {string} name - The topic name to delete
 * @returns {204} No content on success
 */
export async function deleteTopic(req: Request, res: Response) {
    const { name } = req.params;

    //Check topic exists
    const { data: topic, error: topicFetchError } = await supabase
        .schema('question_service')
        .from('topics')
        .select('name')
        .eq('name', name)
        .single();

    if (topicFetchError || !topic) {
        return res.status(404).json({ error: `Topic "${name}" not found` });
    }

    //Find all questions linked to the topic 
    const { data: linkedQuestions, error: linkedError } = await supabase
        .schema('question_service')
        .from('question_topics')
        .select('question_id')
        .eq('topic', name);

    if (linkedError) return res.status(500).json({ error: linkedError.message });

    if (linkedQuestions && linkedQuestions.length > 0) {
        const questionIds = linkedQuestions.map((q: any) => q.question_id);

        //For each linked question, check how many topics it has in total 
        const { data: topicCounts, error: countError } = await supabase
            .schema('question_service')
            .from('question_topics')
            .select('question_id')
            .in('question_id', questionIds);

        if (countError) return res.status(500).json({ error: countError.message });

        // Count topics per question
        const countMap: Record<string, number> = {};
        topicCounts.forEach((row: any) => {
            countMap[row.question_id] = (countMap[row.question_id] || 0) + 1;
        });

        // Questions with only 1 topic (this one) need to be archived
        const toArchive = questionIds.filter((id: string) => countMap[id] === 1);

         if (toArchive.length > 0) {
            const { error: archiveError } = await supabase
                .schema('question_service')
                .from('questions')
                .update({ availability_status: 'archived' })
                .in('id', toArchive);

            if (archiveError) return res.status(500).json({ error: archiveError.message });
        }
    }

    //Delete the topic -- rows will automatically be removed from question_topics bc of CASCADE
    const { error : deleteError } = await supabase
        .schema('question_service')
        .from('topics')
        .delete()
        .eq('name', name);
    
    if (deleteError) return res.status(500).json({ error: deleteError.message });

    return res.status(204).send();
}