// LinkedIn Auto Apply - AI Service (OpenAI Integration)

class AIService {
  constructor(apiKey, model = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = 'https://api.openai.com/v1/chat/completions';
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  setModel(model) {
    this.model = model;
  }

  async testConnection() {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      return response.ok;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }

  async chat(messages, options = {}) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // Analyze job description and extract key requirements
  async analyzeJobDescription(jobDescription, resumeText) {
    const messages = [
      {
        role: 'system',
        content: `You are an expert job application assistant. Analyze job descriptions and help candidates apply effectively.`
      },
      {
        role: 'user',
        content: `Analyze this job description and my resume. Identify:
1. Key requirements
2. Required skills I have
3. Skills I might be missing
4. Important keywords to use in responses

JOB DESCRIPTION:
${jobDescription}

MY RESUME:
${resumeText}

Provide a brief analysis in JSON format:
{
  "matchScore": 0-100,
  "keyRequirements": ["...", "..."],
  "myMatchingSkills": ["...", "..."],
  "missingSkills": ["...", "..."],
  "keywords": ["...", "..."],
  "tips": "Brief application tip"
}`
      }
    ];

    try {
      const response = await this.chat(messages, { temperature: 0.3 });
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return null;
    } catch (error) {
      console.error('Failed to analyze job description:', error);
      return null;
    }
  }

  // Answer an application question based on context
  async answerQuestion(question, options = {}) {
    const {
      jobDescription = '',
      resumeText = '',
      questionType = 'text', // text, textarea, select, radio
      selectOptions = [], // For select/radio questions
      previousAnswers = {},
      additionalInstructions = ''
    } = options;

    let systemPrompt = `You are helping someone apply for a job. Answer application questions concisely and professionally.

Rules:
- Be truthful and don't exaggerate
- Use information from the resume when available
- Match the tone to a job application
- For numeric questions, give just the number
- For yes/no questions, answer only "Yes" or "No"
- Keep answers concise unless it's a cover letter or detailed question
- If you absolutely cannot answer, respond with: "NEED_INPUT: [reason]"`;

    if (additionalInstructions) {
      systemPrompt += `\n\nAdditional instructions from user: ${additionalInstructions}`;
    }

    let userPrompt = `Question: ${question}
Question type: ${questionType}`;

    if (selectOptions.length > 0) {
      userPrompt += `\nAvailable options: ${selectOptions.join(', ')}
Please select the most appropriate option from the list above.`;
    }

    if (resumeText) {
      userPrompt += `\n\nMY RESUME/BACKGROUND:\n${resumeText.substring(0, 3000)}`;
    }

    if (jobDescription) {
      userPrompt += `\n\nJOB DESCRIPTION:\n${jobDescription.substring(0, 2000)}`;
    }

    if (Object.keys(previousAnswers).length > 0) {
      userPrompt += `\n\nPREVIOUS ANSWERS IN THIS APPLICATION:\n${JSON.stringify(previousAnswers)}`;
    }

    userPrompt += `\n\nProvide ONLY the answer, no explanations. If selecting from options, give the exact option text.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await this.chat(messages, { 
        temperature: 0.3,
        maxTokens: questionType === 'textarea' ? 500 : 200
      });
      return response.trim();
    } catch (error) {
      console.error('Failed to answer question:', error);
      return `NEED_INPUT: AI error - ${error.message}`;
    }
  }

  // Generate a cover letter
  async generateCoverLetter(options = {}) {
    const {
      jobTitle = '',
      company = '',
      jobDescription = '',
      resumeText = '',
      style = 'professional', // professional, friendly, concise, detailed
      additionalInstructions = ''
    } = options;

    const styleGuides = {
      professional: 'Write in a formal, professional tone. Use standard business letter format.',
      friendly: 'Write in a warm, conversational tone while remaining professional. Show personality.',
      concise: 'Keep it brief - maximum 150 words. Focus on key qualifications only.',
      detailed: 'Provide a comprehensive letter addressing all major requirements. Include specific examples.'
    };

    const systemPrompt = `You are an expert cover letter writer. Write compelling, personalized cover letters that help candidates stand out.

Style: ${styleGuides[style] || styleGuides.professional}

Rules:
- Personalize to the specific job and company
- Highlight relevant experience from the resume
- Show enthusiasm for the role
- Include a call to action
- Don't use generic phrases like "I am writing to apply for..."
- Don't lie or exaggerate`;

    const userPrompt = `Write a cover letter for this position:

POSITION: ${jobTitle} at ${company}

JOB DESCRIPTION:
${jobDescription.substring(0, 3000)}

MY RESUME:
${resumeText.substring(0, 3000)}

${additionalInstructions ? `ADDITIONAL INSTRUCTIONS: ${additionalInstructions}` : ''}

Write the cover letter now:`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await this.chat(messages, { 
        temperature: 0.7,
        maxTokens: style === 'concise' ? 300 : 800
      });
      return response.trim();
    } catch (error) {
      console.error('Failed to generate cover letter:', error);
      throw error;
    }
  }

  // Determine if a question needs human input
  async shouldAskForInput(question, resumeText, questionType) {
    // Simple heuristics first
    const needsInputPatterns = [
      /salary|compensation|pay|rate/i,
      /start date|available|notice period/i,
      /reference|referral/i,
      /portfolio|website|github/i,
      /why.*company|why.*role|why.*position/i,
      /attach|upload|file/i
    ];

    for (const pattern of needsInputPatterns) {
      if (pattern.test(question)) {
        // These often need specific answers from the user
        const lowerQuestion = question.toLowerCase();
        
        // But some can be answered from resume
        if (lowerQuestion.includes('year') && lowerQuestion.includes('experience')) {
          return false; // Can answer this from resume
        }
        
        return true;
      }
    }

    return false;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined') {
  module.exports = AIService;
}
