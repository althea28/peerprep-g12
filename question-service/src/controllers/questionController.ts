import { supabase } from "../supabaseClient";
import { Request, Response } from 'express';

/**
 * Retrieves all questions from the database with optional filters.
 * Superseded questions are never returned.
 * 
 * @route GET /questions
 * @access Admin only 
 * @queryparam {string} [topic] - Filter by topic name 
 * @queryparam {string} [difficulty] - Filter by difficulty (easy/medium/hard)
 * @queryparam {string} [status] - Filter by status (available/archived only)
 * @returns {Array} List of matching question objects with their topics 
 */
export async function getAllQuestions(req: Request, res: Response) {
    const { topic, difficulty, status } = req.query;

    // Build the query -- never show superseded questions 
    let query = supabase
        .schema('questionservice')
        .from('questions')
        .select(`*, question_topics(topic)`) //join
        .in('availability_status', ['available', 'archived']);

    if (difficulty) query = query.eq('difficulty', difficulty);
    if (status && ['available', 'archived'].includes(status as string)) {
        query = query.eq('availability_status', status);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({error: error.message});

    //if filtered by topic
    const result = topic
        ? data.filter((q: any) => 
            q.question_topics.some((qt: any) => qt.topic === topic)
        )
        : data;
    
        return res.status(200).json(result); 
}

/**
 * Retrieves a single question by its question number.
 * Only returns available or archived versions, never superseded.
 * 
 * @route GET /questions/:questionNumber
 * @access Admin only 
 * @param {strung} questionNumber - The question number to retrieve
 * @returns {Object} The matching question object with its topics
 */
export async function getQuestionByNumber(req: Request, res: Response) {
    const { questionNumber } = req.params;

    const { data, error } = await supabase
        .schema('questionservice')
        .from('questions')
        .select(`*, question_topics(topic)`)
        .eq('question_number', questionNumber)
        .in('availability_status', ['available', 'archived'])
        .single();
    
    if (error || !data) {
        return res.status(404).json({error: 'Question not found'});
    }

    return res.status(200).json(data)
}

/**
 * Create a new question in the repository.
 * All fields are required. Topics must already exist in the topics table. 
 * 
 * @route POST /questions
 * @access Admin only 
 * @body {string} title - Question description
 * @body {string} difficulty - easy/medium/hard
 * @body {string[]} topics - Array of topic names e.g. ["Arrays", "Hash Tables"]
 * @returns {Object} the newly created question object 
 */
export async function createQuestion(req: Request, res: Response) {
    const { title, description, difficulty, topics } = req.body;

    //F8.1.1 -- Validate all required fields are present 
    if (!title || !description || !difficulty || !topics) {
        return res.status(400).json({error: 'The question is missing required fields'}); 
    }

    //jic for now, might not need this later when UI directly allows selection from a list
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
        return res.status(400).json({error: 'Difficulty must be: easy, medium or hard'});
    }

    //same as difficulty
    const { data: existingTopics, error: topicError } = await supabase
        .schema('questionservice')
        .from('topics')
        .select('name')
        .in('name', topics);
    
    if (topicError) return res.status(500).json({ error: topicError.message });

    //if all topics exist, counts will match, if any invalid topics, counts differ
    if (existingTopics.length !== topics.length) {
        //foundNames are topic names that exist
        const foundNames = existingTopics.map((t: any) => t.name);
        const invalid = topics.filter((t: string) => !foundNames.includes(t));
        return res.status(400).json({ error: `These topics do not exist: ${invalid.join(', ')}`});
    }

    //Inserting question
    const { data: newQuestion, error: insertError} = await supabase
        .schema('questionservice')
        .from('questions')
        .insert({ title, description, difficulty, availability_status: 'available'})
        .select()
        .single();
    
    if (insertError) return res.status(500).json({ error: insertError.message});

    //Link topics in question_topics table 
    const topicLinks = topics.map((topic: string) => ({
        question_id: newQuestion.id,
        topic
    }));

    const { error: linkError } = await supabase
        .schema('questionservice')
        .from('question_topics')
        .insert(topicLinks);
    
    if (linkError) return res.status(500).json({ error: linkError.message });

    return res.status(201).json(newQuestion);
}