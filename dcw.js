//Datacube webworker
"use strict";
var baseurl = "http://bigdata-node2.ama-inc.com:5000/";
var preview = false;
var download = false;
var criteria = "";
var lrid = "";
var has_listing = false;
var pixel_count=-1;
var prid = "";
var bounds = "";
var image = "";
var alternative = "";
var brid = "";
var irid = "";


self.addEventListener("message", function(e) {
    // the passed-in data is available via e.data
    console.log("received event: "+e.data);
    var proto_criteria = e.data;
    var pc_arr=proto_criteria.split("#");
    if(pc_arr[0]=="preview"){
      preview = true;
      download = false;
    }
    else if(pc_arr[0]=="download"){
      download = true;
      preview = false;
    }
    else if(pc_arr[0]=="cancel"){
      cancel(pc_arr[1]);
      return;
    }
    else if(pc_arr[0]=="sceneslist"){
      get_scene_list(pc_arr[1]);
      return;
    }
    if(!download){
      criteria = pc_arr[1];
      main();
    } else{
      request_full_size(pc_arr[1],pc_arr[2]);
    }
}, false);
var read_listing_lock=false;
function read_listing(rid){
  if(read_listing_lock){
    return;
  }
  read_listing_lock=true;
  var requester = new XMLHttpRequest();
  requester.open("GET",baseurl+"list/"+lrid+"/view",false);
  requester.send();
  var response = JSON.parse(requester.responseText);
  if(response.request!="WAIT"){
    var tile_list = response.tiles;
    pixel_count = 4000*4000*tile_list.length;
    postMessage("{\"msg\":\"pixel_count\",\"rid\":\""+lrid+"\",\"pixels\":\""+pixel_count+"\"}");
    has_listing = true;
    if(pixel_count>0){

      submit_preview();
    }
    else {
      kill(lrid);
    }
  } else {
    pixel_count = -1;
    read_listing_lock=false;
    setTimeout(read_listing,2000,rid);
  }

}

function get_scene_list(id){
  var requester = new XMLHttpRequest();
  requester.open("GET",baseurl+"get_stats/"+id,false);
  requester.send();
  console.log(requester.responseText);
  var response = JSON.parse(requester.responseText);
  console.log(response);
  if(response.request=="OK"){
    var file_list = response.files.split(',');
    var scene_ids = [];
    for(var i=0;i<file_list.length;i++){
      var requester_file = new XMLHttpRequest();
      console.log(baseurl+file_list[i].substring(1));
      requester_file.open("GET",baseurl+file_list[i].substring(1),false);
      requester_file.send();
      console.log("response"+requester_file.responseText);
      var csv = requester_file.responseText.replace(/\s/g,',').split(',');
      for(var j=0;j<csv.length;j++){

        if(/^[A-Z]+[0-9]*$/.test(csv[j].trim())){
          console.log("found scene");

          scene_ids.push(csv[j].trim());
        }
      }

    }
    console.log("scene list parsed");
    postMessage("{\"msg\":\"scenename\",\"ids\":\""+scene_ids.join(',')+"\"}");
  }
}

function add_task_to_storage(task){
  postMessage("{\"msg\":\"store_task\",\"task\":\""+task+"\"}");
}


function submit_preview(){
  var requester = new XMLHttpRequest();
  if(preview){
    requester.open("GET",baseurl+"mosaic/"+criteria+"/preview",false); //submit our preview request
  } else{
    requester.open("GET",baseurl+"mosaic/"+criteria+"/submit",false); //submit our mosaic request
  }
  requester.send();
  var response = JSON.parse(requester.responseText);
  if(response.request!="WAIT"){
    prid = response.request;
    postMessage("{\"msg\":\"start\",\"rid\":\""+prid+"\",\"description\":\"Preparing Mosaic\"}");
    add_task_to_storage(prid);
  }
  if(prid==""){
    return;
  }
  setTimeout(check_preview,2000,prid);
}

function check_preview(rid){
  var requester = new XMLHttpRequest();
  requester.open("GET",baseurl+"mosaic/"+rid+"/bounds/submit",false); //submit our preview request
  requester.send();
  console.log(requester.responseText);
  var response = JSON.parse(requester.responseText);
  if(response.request!="WAIT"){
    brid = response.request;
    //check the bounds
    check_bounds(brid);
  }
  if(brid==""){
    setTimeout(check_preview,5000,rid); //this part could take a bit
  }

}

function check_bounds(rid){
  var requester = new XMLHttpRequest();
  requester.open("GET",baseurl+"mosaic/"+rid+"/bounds/view",false); //submit our preview request
  requester.send();
  var response = JSON.parse(requester.responseText);
  if(response.request!="WAIT"){
    bounds=response.request;
    //now request the image
    check_image(prid);
  } else {
    setTimeout(check_bounds,2000,rid);
  }

}
function check_image(rid){
  var requester = new XMLHttpRequest();
  requester.open("GET",baseurl+"mosaic/"+rid+"/png/view/submit",false); //submit our preview request
  requester.send();
  console.log("response on check image: "+requester.responseText);
  var response = JSON.parse(requester.responseText);
  if(response.request!="WAIT"){
    irid = response.request;
    check_image_view(irid);

  }
  if(irid=""){
    setTimeout(check_image,2000,rid);
  }

}
function check_image_view(rid){
  var requester = new XMLHttpRequest();
  requester.open("GET",baseurl+"mosaic/"+rid+"/view",false); //submit our preview request
  requester.send();
  console.log("response on check image: "+requester.responseText);
  var response = JSON.parse(requester.responseText);
  if(response.request!="WAIT"){
    image=response.request;
    alternative = response.alternative; //RED MARKED NO DATA
    //now send the client the image and bounds
    postMessage("{\"msg\":\"result\",\"rid\":\""+prid+"\",\"bounds\":\""+bounds+"\",\"image\":\""+image+"\",\"alternative\":\""+alternative+"\",\"stats\":\""+prid+"\"}");
    kill(prid); //Drop progress bar

  }
  else{
    setTimeout(check_image_view,2000,rid);
  }

}
function request_full_size(rid,ff){
  var requester = new XMLHttpRequest();
  requester.open("GET",baseurl+"mosaic/"+rid+"/"+ff+"/view/submit",false);
//submit our preview request
  requester.send();
  var response = JSON.parse(requester.responseText);
  if(response.request!="WAIT"){
    postMessage("{\"msg\":\"start\",\"rid\":\""+response.request+"\",\"description\":\"Preparing download\"}");
    check_full_size_image(response.request);
  }
  else{
    setTimeout(request_full_size,2000,rid,ff);
  }
}
function check_full_size_image(rid){
  var requester = new XMLHttpRequest();
  requester.open("GET",baseurl+"mosaic/"+rid+"/view",false);
  requester.send();
  var response = JSON.parse(requester.responseText);
  if(response.request!="WAIT"){


    var dlimage=response.request;
    var dlalternative = response.alternative; //RED MARKED NO DATA
    postMessage("{\"msg\":\"download\",\"rid\":\""+rid+"\",\"image\":\""+dlimage+"\",\"alternative\":\""+dlalternative+"\"}");
    kill(rid);
  }
  else{
    setTimeout(check_full_size_image,5000,rid);
  }
}
function kill(rid){
  postMessage("{\"msg\":\"end\",\"rid\":\""+rid+"\"}");
}
function cancel(rid){
  var requester = new XMLHttpRequest();
  requester.open("GET",baseurl+"cancel/"+rid,false);
  requester.send();
  postMessage("{\"msg\":\"end\",\"rid\":\""+rid+"\"}");
}
function main(){
  //step 1: submit the list request
  var requester = new XMLHttpRequest();
  console.log("starting: "+baseurl+"list/"+criteria+"/submit");
  requester.open("GET",baseurl+"list/"+criteria+"/submit",false);
  requester.setRequestHeader("Authorization","Basic "+btoa("ceos:ceos123"));
  requester.send();
  console.log("response: "+requester.responseText);
  var list_token = JSON.parse(requester.responseText);
  if(list_token.request!="WAIT"){
    lrid = list_token.request;
    postMessage("{\"msg\":\"start\",\"rid\":\""+lrid+"\",\"description\":\"Finding Pixels\"}");
  }
  if(lrid==""){
    return; //break if we didn't get anything
  }

  setTimeout(read_listing,2000,lrid); //wait 2 seconds and call this
}

