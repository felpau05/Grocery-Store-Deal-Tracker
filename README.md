# Grocery-Store-Deal-Tracker

## To run the labeler.html
run: explorer.exe labeler.html
from wherethe labeler lives

#ctrl+f

anything other than "key": null
"key"\s*:\s*(?!\s*null\b)[^,\r\n]+


Backend (terminal 1):

cd backend
source venv/bin/activate
uvicorn main:app --reload


Frontend (terminal 2):

cd frontend
rm -rf .next
npm run dev

Run Scraper:
python -m flipp_scraper.run --output results.json


Docker Image
docker compose up --build --scale backend=1 --scale scraper-go=1
