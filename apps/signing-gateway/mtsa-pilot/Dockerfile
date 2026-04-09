FROM tomcat:9-jdk17-corretto

USER root

COPY webapps /usr/local/tomcat/webapps/
COPY mtsa /opt/mtsa

EXPOSE 8080

ENV TZ=Asia/Kuala_Lumpur
RUN yum update -y && \
    yum install -y tzdata && \
    ln -fs /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone && \
    yum clean all && \
    rm -rf /var/cache/yum/*

CMD ["sh", "-c", "/usr/local/tomcat/bin/catalina.sh run"]