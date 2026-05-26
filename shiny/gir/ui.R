library(shiny)

# Define UI for application that draws a histogram
fluidPage(

    h3("Glucose infusion rate", width="100%"),
    hr(),
    textInput("dextrose", "% Dextrose", width="100%"),
    textInput("TF", "Total fluid (ml/kg/day)", width="100%"),
    textInput("Rate", "Hourly rate (ml/hr)", width="100%"),
    textInput("wt", "Weight (g)", width="100%"),
    hr(),
    uiOutput("gir")
)
