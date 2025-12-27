# LinkedIn Auto Apply - Chrome Extension

A Chrome extension that automatically applies to LinkedIn Easy Apply jobs with AI-powered features.

## Features

- 🚀 One-click automation
- 🤖 **AI-powered question answering** (uses OpenAI GPT)
- ✍️ **Smart cover letter generation** based on your resume and job description
- ⚙️ Configurable search filters
- 🔍 Smart job filtering (skip by keywords, companies)
- 📊 Real-time statistics
- 📋 Activity logging
- 🎯 Intelligent form auto-fill
- ⏸️ **Pause & ask for input** when AI can't answer

## Installation

### Method 1: Load Unpacked (Developer Mode)

1. **Create icon files** (required):
   - Create PNG icons at these sizes: 16x16, 48x48, 128x128
   - Save them as `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
   - You can use any image editor or online tool

2. **Open Chrome Extensions**:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

3. **Load the extension**:
   - Click "Load unpacked"
   - Select this `chrome-extension` folder

4. **Pin the extension**:
   - Click the puzzle piece icon in Chrome toolbar
   - Pin "LinkedIn Auto Apply"

## Usage

1. **Navigate to LinkedIn Jobs**:
   - Go to https://www.linkedin.com/jobs/

2. **Open Extension Popup**:
   - Click the extension icon

3. **Configure Settings**:
   - Set search keywords
   - Set location
   - Configure filters

4. **Start the Bot**:
   - Click "▶ Start"
   - Watch it apply to jobs automatically!

5. **Monitor Progress**:
   - View real-time stats
   - Check the Logs tab for details

## Settings

### Search Settings
- **Search Keywords**: Job titles to search for
- **Location**: Geographic location
- **Date Posted**: Filter by posting date

### Application Settings
- **Easy Apply only**: Only apply to Easy Apply jobs
- **Pause before submit**: Review before final submit
- **Max applications**: Limit per session
- **Delay between applications**: Wait time between jobs

### Filters
- **Skip jobs containing**: Words to avoid in job titles
- **Skip companies**: Companies to avoid
- **Max years experience**: Skip if requires more experience

### Your Info
- **Years of Experience**: For form filling
- **Phone Number**: For form filling
- **LinkedIn URL**: For form filling
- **Website / Portfolio**: For form filling (also used for GitHub, personal site questions)

### AI Settings (🤖 AI Tab)

#### OpenAI Configuration
- **Enable AI-powered answers**: Toggle AI features on/off
- **API Key**: Your OpenAI API key (get from [platform.openai.com/api-keys](https://platform.openai.com/api-keys))
- **Model**: Choose the AI model
  - GPT-4o Mini: Fast and cheap (recommended)
  - GPT-4o: Best quality
  - GPT-4 Turbo: High quality
  - GPT-3.5 Turbo: Fastest

#### Your Resume/CV
- **Paste your resume text**: The AI uses this to answer questions accurately and generate personalized cover letters

#### Cover Letter Settings
- **Generate cover letters with AI**: Auto-generate cover letters for each job
- **Cover Letter Style**:
  - Professional: Formal business tone
  - Friendly: Conversational but professional
  - Concise: Short and to the point
  - Detailed: Comprehensive coverage
- **Additional instructions**: Custom guidance for the AI (e.g., "Emphasize my leadership skills")

#### Interaction Mode
- **Pause for questions AI can't answer**: Shows a dialog for questions requiring your input
- **Review cover letters before submitting**: Preview and edit generated cover letters
- **Show AI reasoning in logs**: See detailed AI thinking in the Logs tab

## Tips

1. **Login first**: Make sure you're logged into LinkedIn
2. **Start small**: Test with a few applications first
3. **Use filters**: Add bad words to skip irrelevant jobs
4. **Monitor**: Watch the first few applications
5. **Review**: Use "Pause before submit" initially

## Troubleshooting

### Extension not working?
- Make sure you're on a LinkedIn Jobs page
- Check if you're logged into LinkedIn
- Refresh the page and try again

### Jobs being skipped?
- Check your filter settings
- Look at the Logs tab for reasons

### Form not filling correctly?
- Some custom questions can't be auto-filled
- Consider enabling "Pause before submit"

### AI not working?
- Verify your OpenAI API key is correct
- Check that you have API credits in your OpenAI account
- Make sure "Enable AI-powered answers" is checked
- Check the Logs tab for error messages

### Cover letters not generating?
- Ensure "Generate cover letters with AI" is enabled
- Paste your resume in the AI tab
- Check you have sufficient OpenAI API credits

## Privacy

This extension:
- Only runs on LinkedIn.com
- Stores settings locally in your browser
- Does NOT access your LinkedIn password
- Your OpenAI API key is stored locally (never shared)
- **When AI features are enabled**: Job descriptions and your resume are sent to OpenAI to generate answers and cover letters
- OpenAI's privacy policy applies to AI-processed data

## License

MIT License - Free to use and modify
