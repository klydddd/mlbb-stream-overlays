const redName = document.getElementById("redName");
const blueName = document.getElementById("blueName");
let blueScore = document.getElementById("blueScore");
let redScore = document.getElementById("redScore");

let i = 0;


const frameOneSrc = "https://vdo.ninja/?view=r2c9ky4";
const frameTwoSrc = "https://vdo.ninja/?view=uNPLZvDav";

const frameOne = document.getElementById("frameOne");
const frameTwo = document.getElementById("frameTwo");

frameOne.setAttribute('src', frameOneSrc);
frameTwo.setAttribute('src', frameTwoSrc)

function switchSides() {
    // Store current text values
    const redText = redName.innerText;
    const blueText = blueName.innerText;
    const blueScoreVal = parseInt(blueScore.innerText);
    const redScoreVal = parseInt(redScore.innerText);
    const redSideUrl = frameTwoSrc;
    const blueSideUrl = frameOneSrc;
    

    // Swap them
    redName.innerText = blueText;
    blueName.innerText = redText;
    blueScore.innerText = redScoreVal;
    redScore.innerText = blueScoreVal;
    frameTwoSrc = blueSideUrl;
    frameOneSrc = redSideUrl;

}

function addScore(id) {     

    const scoreElement = document.getElementById(id);
    const currentScore = parseInt(scoreElement.innerText);
    
    scoreElement.innerText = currentScore + 1;
    // alert(i);
}

function resetScores() {
    const scores = document.querySelectorAll(".score"); // Step 1: Select all elements with class "score"

    scores.forEach(scoreElement => {
    scoreElement.innerText = "0";                     // Step 2: Set each one to 0
    });
}

    



    