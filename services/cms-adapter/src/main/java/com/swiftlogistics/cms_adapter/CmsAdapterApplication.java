package com.swiftlogistics.cms_adapter;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.retry.annotation.EnableRetry;

@SpringBootApplication
@EnableRetry
public class CmsAdapterApplication {

	public static void main(String[] args) {
		SpringApplication.run(CmsAdapterApplication.class, args);
		System.out.println("CMS Adapter Application started successfully.");
	}

}
