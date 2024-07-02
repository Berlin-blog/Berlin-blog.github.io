<?php
require 'PHPMailerAutoload.php';
 
$mail = new PHPMailer();
$mail->Encoding = "base64";
$mail->isSMTP(); 
$mail->CharSet = "GB2312";		
$mail->Host = "smtp.163.com";     
$mail->SMTPAuth = true;			
$mail->Username = "berlinli0801@163.com";  
$mail->Password = "Libolin122623"; 
$mail->SMTPSecure = "ssl";	
$mail->Port = 465;   		
//$mail->isHTML(true); 

$mail->setFrom("berlinli0801@163.com","邮件主题");     // 设置发件人信息
$mail->addAddress("2088927145@qq.com","");
//$mail->addAddress("收件人2@**.com",""); 
//$mail->addAddress("**@**.com",""); 
//$mail->addReplyTo("***@163.com","Reply");  
//$mail->addCC("evolraelc9@163.com");    // 设置邮件抄送人
//$mail->addBCC("bbbb@163.com");         // 设置秘密抄送人
//$mail->addAttachment("bug0.jpg");      // 添加附件

//下面是将前面表单中填写的数据进行转码。
$nametemp = $_POST['username'];
$name2 = iconv('UTF-8','GB2312',$nametemp);

$emailtemp = $_POST['email'];
$email2 = iconv('UTF-8','GB2312',$emailtemp);

$phoneltemp = $_POST['phone'];
$phone2 = iconv('UTF-8','GB2312',$phoneltemp);

$bookSelecttemp = $_POST['subject'];
$bookSelect2 = iconv('UTF-8','GB2312',$bookSelecttemp);

$commentstemp = $_POST['message'];
$comments2 = iconv('UTF-8','GB2312',$commentstemp);
 
$mail->Subject = "Berlin-blog收到新留言啦~";   
$mail->Body = "　　Name：".$name2."
　　Email：".$email2."
　　Phone：".$phone2."
　　WeChat：".$bookSelect2."
　　Message：".$comments2;

//定义成功或出错弹窗显示的文本信息
$falied = "信息发送失败，请联系网站管理员！";
$falied2 = iconv('GB2312','UTF-8',$falied);

$succeed = "信息发送成功，我已经收到您留言。本页面将关闭，请返回。感谢！";
$succeed2 = iconv('GB2312','UTF-8',$succeed);

//发送邮件
//如果没成功，弹窗显示错误信息
if(!$mail->send()){
    echo "<script language=javascript>alert('$falied2');window.opener=null;window.top.open('','_self','');window.close(this);</script>";
    //echo "Mailer Error: ".$mail->ErrorInfo;  // 输出错误信息
}
//反之成功，显示发送成功文本信息，并将网页关闭，防止用户多次点击提交
else{
    echo "<script language=javascript>alert('$succeed2');window.opener=null;window.top.open('','_self','');window.close(this);</script>";
}
?>
