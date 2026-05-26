#
# This is the server logic of a Shiny web application. You can run the
# application by clicking 'Run App' above.
#
# Find out more about building applications with Shiny here:
#
#    http://shiny.rstudio.com/
#

library(shiny)

# Define server logic required to draw a histogram
function(input, output, session) {
  
  observeEvent(input$TF, {
    if (req(input$Rate)) {
      updateTextInput(session, "wt", value = as.numeric(input$Rate) * 24 / as.numeric(input$TF))
    }
  })
  
  observeEvent(input$wt, {
  })
  
  observeEvent(input$Rate, {
  })
  
}
